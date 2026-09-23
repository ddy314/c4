import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from './config.mjs';

export function fingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export const TRACE_FILE = 'trace-v2.jsonl';
let writeQueue = Promise.resolve();

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function verifyTrace(path) {
  const raw = await readFile(path, 'utf8');
  const lines = raw.trim().split('\n').filter(Boolean);
  let previous = null;
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    let entry;
    try { entry = JSON.parse(line); } catch { return { valid: false, count: index, error: `Invalid JSON at line ${index + 1}` }; }
    const { hash, ...body } = entry;
    if (body.prevHash !== previous || hash !== digest(body)) {
      return { valid: false, count: index, error: `Hash chain mismatch at line ${index + 1}` };
    }
    if (body.boundary === 'human_review' && (!seen.has(body.decisionRef) || !['approved', 'denied'].includes(body.outcome))) {
      return { valid: false, count: index, error: `Invalid review receipt at line ${index + 1}` };
    }
    seen.add(hash);
    previous = hash;
  }
  return { valid: true, count: lines.length, head: previous };
}

async function appendRecord(event) {
  const directory = process.env.C4_AUDIT_DIR ?? join(projectRoot, '.runs');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, TRACE_FILE);
  let previous = null;
  try {
    const raw = await readFile(path, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    if (lines.length) {
      const checked = await verifyTrace(path);
      if (!checked.valid) throw new Error(`Refusing to append to invalid audit chain: ${checked.error}`);
      previous = checked.head;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const body = { at: new Date().toISOString(), version: 2, prevHash: previous, ...event };
  const hash = digest(body);
  await appendFile(path, `${JSON.stringify({ ...body, hash })}\n`, { mode: 0o600 });
  return hash;
}

export function record(event) {
  const operation = writeQueue.catch(() => {}).then(() => appendRecord(event));
  writeQueue = operation;
  return operation;
}
