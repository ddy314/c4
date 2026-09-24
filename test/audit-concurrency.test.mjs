import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, unlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { record, readVerifiedTrace, TRACE_FILE, verifyTrace } from '../src/audit.mjs';

const auditModule = new URL('../src/audit.mjs', import.meta.url).href;
const writerSource = `
  import { record } from ${JSON.stringify(auditModule)};
  const worker = Number(process.argv.at(-1));
  await record({ boundary: 'input', outcome: 'allow', worker });
`;

function runWriter(directory, worker, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', writerSource, String(worker)], {
      cwd: process.cwd(),
      env: { ...process.env, C4_AUDIT_DIR: directory, ...extraEnvironment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`writer ${worker} exited with ${code ?? signal}: ${stderr}`));
    });
  });
}

test('audit append is serialized across concurrent Node processes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'c4-audit-concurrent-'));
  const writers = 24;
  await Promise.all(Array.from({ length: writers }, (_, worker) => runWriter(directory, worker)));

  const path = join(directory, TRACE_FILE);
  const checked = await verifyTrace(path);
  assert.equal(checked.valid, true);
  assert.equal(checked.count, writers);
  const entries = await readVerifiedTrace(path);
  assert.equal(entries.length, writers);
  assert.equal(new Set(entries.map((entry) => entry.worker)).size, writers);
  assert.equal((await readFile(`${path}.lock`, 'utf8').catch((error) => error.code)), 'ENOENT');
});

test('audit lock fails closed for a live owner and cautiously reclaims a dead owner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'c4-audit-lock-'));
  const path = join(directory, TRACE_FILE);
  const lockPath = `${path}.lock`;

  await writeFile(lockPath, JSON.stringify({ version: 1, pid: process.pid, token: 'live-owner' }), { mode: 0o600 });
  await assert.rejects(
    runWriter(directory, 1, { C4_AUDIT_LOCK_TIMEOUT_MS: '120', C4_AUDIT_LOCK_RETRY_MS: '10' }),
    /Timed out waiting for audit lock/,
  );
  await unlink(lockPath);

  await writeFile(lockPath, JSON.stringify({ version: 1, pid: 2147483647, token: 'dead-owner' }), { mode: 0o600 });
  const old = new Date(Date.now() - 60_000);
  await utimes(lockPath, old, old);
  await runWriter(directory, 2, { C4_AUDIT_LOCK_TIMEOUT_MS: '500', C4_AUDIT_LOCK_RETRY_MS: '10' });
  assert.equal((await verifyTrace(path)).valid, true);
});

test('readVerifiedTrace treats a missing first trace as empty but rejects corruption', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'c4-audit-read-'));
  const path = join(directory, TRACE_FILE);
  assert.deepEqual(await readVerifiedTrace(path), []);

  await record({ boundary: 'input', outcome: 'allow', worker: 'read-test' }, { directory });
  const raw = await readFile(path, 'utf8');
  await writeFile(path, raw.replace('"outcome":"allow"', '"outcome":"block"'));
  await assert.rejects(readVerifiedTrace(path), /Invalid audit chain/);
});
