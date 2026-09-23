import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';
import { TRACE_FILE } from '../src/audit.mjs';

const model = 'gemini-3.8-flash';
const project = process.env.GOOGLE_CLOUD_PROJECT;
const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!project || !credential) throw new Error('Set GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS before running the Pi A/B benchmark');

const scenarios = [
  ['The import must preserve the exact original CSV header order.', 'Never overwrite a destination file unless the user explicitly confirms.'],
  ['The audit log must include the source record identifier.', 'The reviewer must approve a policy change before deployment.'],
  ['The summary must display the dataset commit hash.', 'Do not count timed-out calls as successful decisions.'],
  ['The export must omit raw user messages.', 'Keep the original timestamp with each review receipt.'],
];
const trialCount = Number(process.env.C4_PI_TRIALS ?? 4);
if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > scenarios.length) throw new Error('C4_PI_TRIALS must be 1..4');
const noise = Array.from({ length: 45 }, (_, i) => `Progress line ${String(i + 1).padStart(2, '0')}: parsed temporary batch, routine status, no new decision.`).join('\n');

class PiRpc {
  constructor(child) {
    this.child = child;
    this.events = [];
    this.pending = new Map();
    this.waiters = [];
    this.nextId = 1;
    this.stderr = '';
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        let item;
        try { item = JSON.parse(line); } catch { continue; }
        this.events.push(item);
        if (item.type === 'response' && item.id && this.pending.has(item.id)) {
          this.pending.get(item.id)(item);
          this.pending.delete(item.id);
        }
        for (const waiter of [...this.waiters]) {
          if (waiter.predicate(item)) {
            waiter.resolve(item);
            this.waiters.splice(this.waiters.indexOf(waiter), 1);
          }
        }
      }
    });
    child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk.toString()).slice(-1500); });
  }

  command(type, data = {}) {
    const id = `c${this.nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Pi ${type} timed out: ${this.stderr}`)); }, 120_000);
      this.pending.set(id, (item) => {
        clearTimeout(timer);
        item.success ? resolve(item) : reject(new Error(`Pi ${type}: ${JSON.stringify(item.error ?? item).slice(0, 500)}`));
      });
      this.child.stdin.write(`${JSON.stringify({ id, type, ...data })}\n`);
    });
  }

  waitFor(predicate, timeoutMs = 120_000) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve: (item) => { clearTimeout(timer); resolve(item); } };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`Pi event timed out: ${this.stderr}`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  async prompt(message) {
    const after = this.events.length;
    const settled = this.waitFor((item) => item.type === 'agent_settled');
    await this.command('prompt', { message });
    await settled;
    const assistant = this.events.slice(after).filter((item) => item.type === 'message_end' && item.message?.role === 'assistant');
    const last = assistant.at(-1)?.message;
    if (!last || last.stopReason === 'error') throw new Error(`Pi model failed: ${JSON.stringify(last?.errorMessage ?? last ?? this.stderr).slice(0, 500)}`);
    return (last.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  }

  close() { this.child.stdin.end(); this.child.kill(); }
}

async function arm(mode, root, trial, facts) {
  const trialRoot = join(root, `trial-${trial}`, mode);
  const prompts = [
    `Remember these requirements for a later check:\n${facts.join('\n')}\n\nHere is unrelated routine output:\n${noise}\nReply only ACK.`,
    'Acknowledge that you are ready for the next question. Reply only ACK.',
    'What were the two exact requirements from the first message? Answer with only those two requirements.',
  ];
  const configDir = join(trialRoot, 'config');
  const workDir = join(trialRoot, 'work');
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await mkdir(workDir, { recursive: true, mode: 0o700 });
  await writeFile(join(configDir, 'settings.json'), JSON.stringify({ compaction: { keepRecentTokens: 1 } }), { mode: 0o600 });
  const args = ['--mode', 'rpc', '--provider', 'google-vertex', '--model', model, '--thinking', 'low', '--no-session', '--no-tools', '--no-skills', '--no-context-files', '--no-extensions'];
  if (mode === 'c4') args.push('--extension', join(projectRoot, 'pi/c4.ts'));
  const child = spawn('pi', args, { cwd: workDir, env: { ...process.env, PI_CODING_AGENT_DIR: configDir, C4_MODE: 'compaction', C4_AUDIT_DIR: trialRoot }, stdio: ['pipe', 'pipe', 'pipe'] });
  const rpc = new PiRpc(child);
  const started = performance.now();
  try {
    await rpc.prompt(prompts[0]);
    await rpc.prompt(prompts[1]);
    const compactStarted = performance.now();
    const compacted = await rpc.command('compact');
    const compactLatencyMs = Math.round(performance.now() - compactStarted);
    const answer = await rpc.prompt(prompts[2]);
    const stats = (await rpc.command('get_session_stats')).data;
    let jevCostUsd = 0;
    if (mode === 'c4') {
      const lines = (await readFile(join(trialRoot, TRACE_FILE), 'utf8')).trim().split('\n');
      jevCostUsd = lines.map((line) => JSON.parse(line).jev?.costUsd ?? 0).reduce((sum, value) => sum + value, 0);
    }
    return {
      mode, trial, facts,
      elapsedMs: Math.round(performance.now() - started),
      compactLatencyMs,
      compaction: { tokensBefore: compacted.data?.tokensBefore, estimatedTokensAfter: compacted.data?.estimatedTokensAfter, usage: compacted.data?.usage, details: compacted.data?.details },
      answer,
      retained: facts.map((fact) => answer.includes(fact)),
      mainModelCostUsd: stats?.cost,
      jevCostUsd,
      totalCostUsd: (stats?.cost ?? 0) + jevCostUsd,
      mainModelTokens: stats?.tokens,
      assistantMessages: stats?.assistantMessages,
    };
  } finally { rpc.close(); }
}

const root = join(projectRoot, '.runs', `pi-ab-${Date.now()}`);
const results = { benchmark: 'pi-ab-v2', at: new Date().toISOString(), host: 'Pi', model: `google-vertex/${model}`, trialCount, arms: [] };
for (let trial = 0; trial < trialCount; trial++) {
  const facts = scenarios[trial];
  for (const mode of trial % 2 ? ['c4', 'native'] : ['native', 'c4']) {
    try {
      const result = await arm(mode, root, trial, facts);
      results.arms.push(result);
      console.log(`trial ${trial + 1} ${mode}: ${result.retained.filter(Boolean).length}/${facts.length} facts; compaction ${result.compactLatencyMs} ms; wall ${result.elapsedMs} ms; Pi $${Number(result.mainModelCostUsd ?? 0).toFixed(6)} + Jev $${result.jevCostUsd.toFixed(6)}`);
    } catch (error) {
      results.arms.push({ mode, trial, error: String(error).slice(0, 700) });
      console.error(`trial ${trial + 1} ${mode}: ${String(error).slice(0, 300)}`);
    }
  }
}
await mkdir(join(projectRoot, '.runs'), { recursive: true, mode: 0o700 });
await writeFile(join(projectRoot, '.runs', 'pi-ab.json'), `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });
if (results.arms.some((item) => item.error)) process.exitCode = 1;
