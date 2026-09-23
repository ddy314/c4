import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { JevClient } from '../src/jev.mjs';
import { selectMemory } from '../src/memory.mjs';
import { projectRoot } from '../src/config.mjs';

const fixtures = JSON.parse(await readFile(join(projectRoot, 'fixtures/memory.json'), 'utf8'));
const client = new JevClient();
const records = [];
for (const item of fixtures) {
  const source = JSON.stringify(item.messages);
  const started = performance.now();
  try {
    const decision = await selectMemory({ messages: item.messages, goal: item.goal, budgetChars: item.budgetChars ?? Math.max(1000, Math.floor(source.length * 0.35)), client });
    const required = item.required.map((fact) => ({ fact, retained: decision.summary.includes(fact) }));
    records.push({ id: item.id, required, recall: required.filter((fact) => fact.retained).length / required.length, sourceChars: source.length, summaryChars: decision.summary.length, candidateCount: decision.candidates, selectedIds: decision.selected.map((selection) => selection.id), latencyMs: Math.round(performance.now() - started), jev: decision.usage });
  } catch (error) {
    records.push({ id: item.id, error: String(error).slice(0, 250), recall: 0 });
  }
}
const requiredCount = records.reduce((sum, item) => sum + (item.required?.length ?? 0), 0);
const retainedCount = records.reduce((sum, item) => sum + (item.required?.filter((fact) => fact.retained).length ?? 0), 0);
const summary = { benchmark: 'memory-v1', at: new Date().toISOString(), requiredCount, retainedCount, recall: requiredCount ? retainedCount / requiredCount : 0, jevCostUsd: records.reduce((sum, item) => sum + (item.jev?.costUsd ?? 0), 0), records };
const outDir = join(projectRoot, '.runs');
await mkdir(outDir, { recursive: true, mode: 0o700 });
await writeFile(join(outDir, 'memory.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(`Memory: ${retainedCount}/${requiredCount} required facts retained; $${summary.jevCostUsd.toFixed(6)} Jev cost`);
for (const item of records) console.log(`${item.recall === 1 ? 'PASS' : 'FAIL'} ${item.id}: recall=${item.recall}, source=${item.sourceChars ?? '-'} chars, summary=${item.summaryChars ?? '-'} chars${item.error ? ` (${item.error})` : ''}`);
if (records.some((item) => item.error) || retainedCount !== requiredCount) process.exitCode = 1;
