import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';

const root = join(projectRoot, '.runs');
const run = JSON.parse(await readFile(join(root, 'openrouter-matrix-v2.json'), 'utf8'));
const summary = JSON.parse(await readFile(join(root, 'openrouter-matrix-summary.json'), 'utf8'));
const baseline = JSON.parse(await readFile(join(root, 'comparison-validation.json'), 'utf8'));
assert.equal(run.benchmark, 'openrouter-matrix-v2');
assert.equal(run.models.length, 7);
assert.equal(run.cases.length, 132);
assert.equal(new Set(run.cases.map((row) => row.id)).size, 132);
assert.equal(run.cases.filter((row) => row.label === 'attack').length, 60);
assert.equal(run.cases.filter((row) => row.label === 'benign').length, 72);
const baselineById = new Map(baseline.offlineResults.map((row) => [row.id, row]));
for (const item of run.cases.filter((row) => !row.id.startsWith('hard-'))) assert.equal(baselineById.get(item.id)?.label, item.label);
const latest = new Map();
for (const row of run.results) {
  assert.ok(run.models.some((model) => model.id === row.model));
  assert.ok(run.cases.some((item) => item.id === row.id && item.label === row.label));
  latest.set(`${row.model}::${row.id}`, row);
}
for (const model of run.models) for (const item of run.cases) assert.equal(typeof latest.get(`${model.id}::${item.id}`)?.prediction, 'boolean', `${model.id} ${item.id} has no valid final response`);
assert.equal(latest.size, 924);
assert.equal(run.results.length, run.requests);
const totalReported = run.results.reduce((sum, row) => sum + row.reportedCostUsd, 0);
const totalReserved = run.results.reduce((sum, row) => sum + row.budgetChargeUsd, 0);
assert.ok(Math.abs(totalReported - run.reportedUsd) < 1e-9);
assert.ok(Math.abs(totalReserved - run.budgetChargeUsd) < 1e-9);
assert.ok(run.reportedUsd <= 2 && run.budgetChargeUsd <= run.budgetCapUsd && run.budgetCapUsd <= 2);
assert.equal(summary.completeness.completedCells, 924);
assert.equal(summary.completeness.validCommonResponses, 840);
assert.equal(summary.methods.length, 9);
for (const model of run.models) {
  const metric = summary.methods.find((row) => row.id === model.id);
  assert.ok(metric);
  const rows = run.cases.filter((item) => !item.id.startsWith('hard-')).map((item) => ({ item, result: latest.get(`${model.id}::${item.id}`) }));
  assert.equal(metric.caught, rows.filter(({ item, result }) => item.label === 'attack' && result.prediction === true).length);
  assert.equal(metric.falseAlarms, rows.filter(({ item, result }) => item.label === 'benign' && result.prediction === true).length);
  assert.equal(metric.valid, 120);
}
console.log(`Verified ${latest.size} final classifications, ${run.requests - latest.size} retry calls, $${run.reportedUsd.toFixed(6)} reported, $${run.budgetChargeUsd.toFixed(6)} conservative charge.`);
