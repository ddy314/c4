import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';

const root = join(projectRoot, '.runs');
const read = async (name) => JSON.parse(await readFile(join(root, name), 'utf8'));
const splits = Object.fromEntries(await Promise.all(['dev', 'holdout', 'comparison', 'validation'].map(async (name) => [name, await read(`injection-${name}.json`)])));
const groups = new Map();
for (const [split, run] of Object.entries(splits)) {
  if (run.results.length !== run.count || run.count !== run.plannedCount || run.errors !== 0) throw new Error(`${split}: incomplete or errored Jev run`);
  const ids = new Set();
  for (const row of run.results) {
    if (ids.has(row.id)) throw new Error(`${split}: duplicate case ID ${row.id}`);
    ids.add(row.id);
    if (groups.has(row.id)) throw new Error(`${split}: case ${row.id} overlaps ${groups.get(row.id)}`);
    groups.set(row.id, split);
  }
  const attacks = run.results.filter((row) => row.label === 'attack');
  const controls = run.results.filter((row) => row.label === 'benign');
  if (attacks.length !== run.attackCount || controls.length !== run.benignCount || attacks.filter((row) => row.action !== 'allow').length !== run.caught || controls.filter((row) => row.action !== 'allow').length !== run.falseAlarms) throw new Error(`${split}: summary does not reconcile`);
}
const validation = await read('comparison-validation.json');
const gemini = await read('comparison-comparison.json');
if (validation.offlineResults.length !== 120 || validation.uniqueAttackInstructions < 1) throw new Error('Validation comparison is incomplete');
for (const [name, comparison] of [['validation', validation], ['comparison', gemini]]) {
  const jev = new Map(splits[name].results.map((row) => [row.id, row]));
  if (comparison.offlineResults.length !== splits[name].count) throw new Error(`${name}: offline coverage mismatch`);
  for (const row of comparison.offlineResults) if (row.jev.action !== jev.get(row.id)?.action || row.label !== jev.get(row.id)?.label) throw new Error(`${name}: Jev join mismatch`);
}
const attack = validation.offlineResults.filter((row) => row.label === 'attack');
const benign = validation.offlineResults.filter((row) => row.label === 'benign');
const classify = (rows, fn) => rows.filter(fn).length;
const metrics = {
  c4: { caught: classify(attack, (row) => row.jev.action !== 'allow'), falseAlarms: classify(benign, (row) => row.jev.action !== 'allow') },
  actionRules: { caught: classify(attack, (row) => row.actionRegex.injection), falseAlarms: classify(benign, (row) => row.actionRegex.injection) },
  classicRegex: { caught: classify(attack, (row) => row.regex.injection), falseAlarms: classify(benign, (row) => row.regex.injection) },
};
const validGemini = gemini.results.filter((row) => typeof row.gemini?.injection === 'boolean');
const summary = { verifiedAt: new Date().toISOString(), disjointSplits: Object.fromEntries(Object.entries(splits).map(([name, run]) => [name, { count: run.count, offset: run.sampleOffset }])), validation: { attacks: attack.length, controls: benign.length, uniqueAttackInstructions: validation.uniqueAttackInstructions, metrics }, gemini: { attemptedRequests: gemini.geminiCalls, validClassifications: validGemini.length, plannedCases: gemini.plannedCount, estimatedUsageUsd: gemini.geminiCostUsd } };
await writeFile(join(root, 'benchmark-audit.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(`Verified four disjoint splits; validation Jev ${metrics.c4.caught}/${attack.length}, action rules ${metrics.actionRules.caught}/${attack.length}; Gemini ${validGemini.length}/${gemini.plannedCount} valid cases`);
