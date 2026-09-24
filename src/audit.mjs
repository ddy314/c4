import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { projectRoot } from './config.mjs';

export function fingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export const TRACE_FILE = 'trace-v2.jsonl';
const LOCK_SUFFIX = '.lock';
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_RETRY_MS = 20;
const DEFAULT_LOCK_STALE_MS = 30_000;
let writeQueue = Promise.resolve();

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parseTrace(raw) {
  const lines = raw.trim().split('\n').filter(Boolean);
  let previous = null;
  const seen = new Map();
  const reviewed = new Set();
  const entries = [];
  for (const [index, line] of lines.entries()) {
    let entry;
    try { entry = JSON.parse(line); } catch { return { valid: false, count: index, error: `Invalid JSON at line ${index + 1}` }; }
    const { hash, ...body } = entry;
    if (body.prevHash !== previous || hash !== digest(body)) {
      return { valid: false, count: index, error: `Hash chain mismatch at line ${index + 1}` };
    }
    if (body.boundary === 'human_review') {
      const subject = seen.get(body.decisionRef);
      if (!subject || !['approved', 'denied'].includes(body.outcome)) {
        return { valid: false, count: index, error: `Invalid review receipt at line ${index + 1}` };
      }
      if (body.subject === 'tool_call') {
        const boundSchema = subject.sessionKey !== undefined || body.sessionKey !== undefined;
        if (boundSchema && (subject.boundary !== 'tool_call' || body.tool !== subject.tool
          || body.inputHash !== subject.inputHash || body.host !== subject.host
          || body.sessionKey !== subject.sessionKey
          || body.policyHash !== subject.policyHash || body.flowPolicyHash !== subject.flowPolicyHash
          || reviewed.has(body.decisionRef)
          || (body.outcome === 'approved' && subject.outcome !== 'ask'))) {
          return { valid: false, count: index, error: `Unbound tool approval at line ${index + 1}` };
        }
        reviewed.add(body.decisionRef);
      }
    }
    entries.push(entry);
    seen.set(hash, entry);
    previous = hash;
  }
  return { valid: true, count: lines.length, head: previous, entries };
}

export async function verifyTrace(path) {
  const raw = await readFile(path, 'utf8');
  const { entries: _entries, ...result } = parseTrace(raw);
  return result;
}

function durationFromEnv(name, fallback, maximum) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isSafeInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

function lockPathFor(tracePath) {
  return `${tracePath}${LOCK_SUFFIX}`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function ownerIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

async function reclaimStaleLock(lockPath) {
  let lockStat;
  try {
    lockStat = await stat(lockPath);
  } catch (error) {
    return error?.code === 'ENOENT';
  }
  const staleAfter = durationFromEnv('C4_AUDIT_LOCK_STALE_MS', DEFAULT_LOCK_STALE_MS, 24 * 60 * 60 * 1_000);
  if (Date.now() - lockStat.mtimeMs < staleAfter) return false;

  // Only reclaim an old lock when its owner is explicitly identified and is
  // definitely gone. Malformed or live-owner locks fail closed instead.
  let owner;
  try {
    owner = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    return false;
  }
  const pid = owner?.pid;
  if (!Number.isSafeInteger(pid) || pid < 1 || await ownerIsAlive(pid)) return false;
  try {
    await unlink(lockPath);
    return true;
  } catch (error) {
    return error?.code === 'ENOENT';
  }
}

async function acquireLock(tracePath) {
  const lockPath = lockPathFor(tracePath);
  const timeout = durationFromEnv('C4_AUDIT_LOCK_TIMEOUT_MS', DEFAULT_LOCK_TIMEOUT_MS, 60_000);
  const retry = durationFromEnv('C4_AUDIT_LOCK_RETRY_MS', DEFAULT_LOCK_RETRY_MS, 1_000);
  const deadline = Date.now() + timeout;
  await mkdir(dirname(tracePath), { recursive: true, mode: 0o700 });

  while (true) {
    let handle;
    try {
      handle = await open(lockPath, 'wx', 0o600);
      const metadata = JSON.stringify({ version: 1, pid: process.pid, token: randomUUID(), acquiredAt: new Date().toISOString() });
      await handle.writeFile(metadata, 'utf8');
      await handle.sync();
      return async () => {
        let releaseError;
        try { await handle.close(); } catch (error) { releaseError = error; }
        try { await unlink(lockPath); } catch (error) {
          if (error?.code !== 'ENOENT' && !releaseError) releaseError = error;
        }
        if (releaseError) throw releaseError;
      };
    } catch (error) {
      if (handle) {
        try { await handle.close(); } catch { /* preserve the acquisition error */ }
        try { await unlink(lockPath); } catch { /* preserve the acquisition error */ }
      }
      if (error?.code !== 'EEXIST') throw error;
      if (await reclaimStaleLock(lockPath)) continue;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Timed out waiting for audit lock ${lockPath}; refusing to append`);
      }
      await sleep(Math.min(retry, remaining));
    }
  }
}

async function readTrace(path) {
  const raw = await readFile(path, 'utf8');
  return parseTrace(raw);
}

/**
 * Read a complete, hash-verified trace while holding the same inter-process
 * lock used by record(). A trace that does not exist yet is an empty trace;
 * any existing corruption is an error and must be handled fail-closed.
 */
export async function readVerifiedTrace(path) {
  const release = await acquireLock(path);
  try {
    let checked;
    try {
      checked = await readTrace(path);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    if (!checked.valid) throw new Error(`Invalid audit chain: ${checked.error}`);
    return checked.entries;
  } finally {
    await release();
  }
}

async function appendRecord(event, { directory } = {}) {
  const targetDirectory = directory ?? process.env.C4_AUDIT_DIR ?? join(projectRoot, '.runs');
  const directoryPath = String(targetDirectory);
  const path = join(directoryPath, TRACE_FILE);
  const release = await acquireLock(path);
  try {
    let checked = { valid: true, head: null, entries: [] };
    try {
      checked = await readTrace(path);
      if (!checked.valid) throw new Error(`Refusing to append to invalid audit chain: ${checked.error}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (event.boundary === 'human_review') {
      const source = checked.entries.find((entry) => entry.hash === event.decisionRef);
      if (!source) throw new Error('Review decision reference is not in this trace');
      if (event.subject === 'tool_call' && (source.sessionKey !== undefined || event.sessionKey !== undefined)) {
        if (source.boundary !== 'tool_call' || source.tool !== event.tool || source.inputHash !== event.inputHash
          || source.host !== event.host || source.sessionKey !== event.sessionKey
          || source.policyHash !== event.policyHash || source.flowPolicyHash !== event.flowPolicyHash
          || (event.outcome === 'approved' && source.outcome !== 'ask')
          || checked.entries.some((entry) => entry.boundary === 'human_review' && entry.decisionRef === event.decisionRef)) {
          throw new Error('Refusing an unbound or duplicate tool review');
        }
      }
    }
    const body = { at: new Date().toISOString(), version: 2, prevHash: checked.head, ...event };
    const hash = digest(body);
    await appendFile(path, `${JSON.stringify({ ...body, hash })}\n`, { mode: 0o600 });
    return hash;
  } finally {
    await release();
  }
}

export function record(event, options = {}) {
  const operation = writeQueue.catch(() => {}).then(() => appendRecord(event, options));
  writeQueue = operation;
  return operation;
}
