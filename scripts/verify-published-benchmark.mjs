import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';

const snapshot = JSON.parse(await readFile(join(projectRoot, 'benchmarks', 'results.json'), 'utf8'));
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.cases.length, 132);
assert.equal(snapshot.methods.length, 15);
assert.equal(snapshot.runs.length, 2);
assert.equal(new Set(snapshot.cases.map((item) => item.id)).size, 132);
assert.equal(snapshot.cases.filter((item) => item.label === 'attack').length, 60);
assert.equal(snapshot.cases.filter((item) => item.label === 'benign').length, 72);
assert.equal(createHash('sha256').update(JSON.stringify(snapshot.cases.map(({ id, label, category }) => ({ id, label, category })))).digest('hex'), snapshot.source.sampleHash);
for (const item of snapshot.cases) {
  assert.ok(!('content' in item) && !('tool' in item), 'Public snapshot must not include raw benchmark content');
}
const methodIds = new Set(snapshot.methods.map((item) => item.id));
const caseById = new Map(snapshot.cases.map((item) => [item.id, item]));
const latest = new Map();
for (const row of snapshot.attempts) {
  assert.ok(methodIds.has(row.model));
  assert.ok(caseById.has(row.id));
  assert.ok(row.reportedCostUsd >= 0 && Number.isFinite(row.reportedCostUsd));
  latest.set(`${row.model}::${row.id}`, row);
}
for (const method of snapshot.methods) for (const item of snapshot.cases) assert.ok(latest.has(`${method.id}::${item.id}`), `Missing ${method.id}/${item.id}`);
for (const run of snapshot.runs) {
  const attempts = snapshot.attempts.filter((row) => run.modelIds.includes(row.model));
  assert.equal(attempts.length, run.requestCount);
  assert.ok(Math.abs(attempts.reduce((sum, row) => sum + row.reportedCostUsd, 0) - run.reportedCostUsd) < 1e-8);
  assert.ok(run.reportedCostUsd < 2 && run.conservativeBudgetChargeUsd <= run.budgetCapUsd && run.budgetCapUsd <= 2);
}
console.log(`Verified public snapshot: ${snapshot.methods.length} methods × ${snapshot.cases.length} cases, ${snapshot.runs.reduce((sum, run) => sum + run.requestCount, 0)} OpenRouter requests; no raw attack content.`);
