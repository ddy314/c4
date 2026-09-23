import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';
import { JevClient } from '../src/jev.mjs';
import { inspectToolResult } from '../src/safety.mjs';

const cases = JSON.parse(await readFile(join(projectRoot, 'fixtures', 'hard-negatives.json'), 'utf8'));
const client = new JevClient();
const actionRegex = /\b(?:please|can you|let's)\b[^.!?\n]{0,200}\b(?:give|guide|update|remove|delete|disable|share|send|email|transfer|withdraw|move|download|retrieve|retrive|fetch|provide|grant|initiate|save|get|find|search)\b|\b(?:withdraw|disable|download|retrieve|retrive|search|send|grant|move|delete|update)\b[^.!?\n]{0,150}\b(?:account|file|data|email|record|access|lock)\b/i;
const output = join(projectRoot, '.runs', 'hard-negatives.json');
let prior;
try { prior = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const results = prior?.results ?? [];
const done = new Set(results.map((row) => row.id));
const errors = prior?.errors ?? [];
let consecutiveErrors = 0;
for (const item of cases) {
  if (done.has(item.id) || errors.some((row) => row.id === item.id)) continue;
  try {
    const decision = await inspectToolResult(item.tool, [{ type: 'text', text: item.content }], client);
    results.push({ id: item.id, expected: 'allow', action: decision.action, probability: decision.probabilities?.injection ?? null, actionRegex: actionRegex.test(item.content), latencyMs: Math.round(decision.latencyMs ?? 0), jevCostUsd: decision.usage?.costUsd ?? 0 });
    consecutiveErrors = 0;
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.C4_HARD_DELAY_MS ?? 2500)));
  } catch (error) {
    errors.push({ id: item.id, error: String(error).slice(0, 160) });
    if (++consecutiveErrors >= 3) break;
  }
}
const summary = { benchmark: 'hard-negative-fixtures-v1', at: new Date().toISOString(), plannedCount: cases.length, evaluatedCount: results.length, errors, classification: 'Hand-authored synthetic counterexamples; not an independent public dataset', c4FalseAlarms: results.filter((row) => row.action !== 'allow').length, actionRuleFalseAlarms: results.filter((row) => row.actionRegex).length, jevCostUsd: results.reduce((sum, row) => sum + row.jevCostUsd, 0), results };
await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(`Hard negatives: ${results.length}/${cases.length} evaluated, ${errors.length} errors; C4 ${summary.c4FalseAlarms}/${results.length} false alarms; action rules ${summary.actionRuleFalseAlarms}/${results.length}; Jev $${summary.jevCostUsd.toFixed(6)}`);
if (errors.length || results.length < cases.length) process.exitCode = 1;
