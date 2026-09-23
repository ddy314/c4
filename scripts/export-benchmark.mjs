import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';

const runRoot = join(projectRoot, '.runs');
const legacy = JSON.parse(await readFile(join(runRoot, 'openrouter-matrix-v2.json'), 'utf8'));
const modern = JSON.parse(await readFile(join(runRoot, 'openrouter-matrix-modern-v4.json'), 'utf8'));
const c4 = JSON.parse(await readFile(join(runRoot, 'comparison-validation.json'), 'utf8'));
const hard = JSON.parse(await readFile(join(runRoot, 'hard-negatives.json'), 'utf8'));
if (legacy.sampleHash !== modern.sampleHash || legacy.promptHash !== modern.promptHash) throw new Error('Matrix cohorts or classifier prompts differ');
if (legacy.cases.length !== 132 || modern.cases.length !== 132 || JSON.stringify(legacy.cases) !== JSON.stringify(modern.cases)) throw new Error('Matrix cases differ');
const caseById = new Map(legacy.cases.map((item) => [item.id, item]));
const take = (row) => ({ model: row.model, id: row.id, prediction: row.prediction, error: row.error, latencyMs: row.latencyMs, inputTokens: row.inputTokens, outputTokens: row.outputTokens, reportedCostUsd: row.reportedCostUsd, finishReason: row.finishReason });
for (const run of [legacy, modern]) for (const row of run.results) {
  if (!caseById.has(row.id) || !run.models.some((model) => model.id === row.model)) throw new Error(`Unexpected result ${row.model}/${row.id}`);
}
const baseline = new Map(c4.offlineResults.map((row) => [row.id, row]));
for (const item of legacy.cases.filter((row) => !row.id.startsWith('hard-'))) if (baseline.get(item.id)?.label !== item.label) throw new Error(`Baseline mismatch ${item.id}`);
const hardById = new Map(hard.results.map((row) => [`hard-${row.id}`, row]));
const localRows = legacy.cases.flatMap((item) => {
  const record = item.id.startsWith('hard-') ? hardById.get(item.id) : baseline.get(item.id);
  const jev = item.id.startsWith('hard-') ? record : record?.jev;
  const rule = item.id.startsWith('hard-') ? record?.actionRegex : record?.actionRegex?.injection;
  return [
    { model: 'c4', id: item.id, prediction: jev ? jev.action !== 'allow' : null, error: jev ? null : 'unavailable', latencyMs: jev?.latencyMs ?? null, inputTokens: null, outputTokens: null, reportedCostUsd: jev?.jevCostUsd ?? 0, finishReason: null },
    { model: 'action-rule', id: item.id, prediction: typeof rule === 'boolean' ? rule : null, error: typeof rule === 'boolean' ? null : 'unavailable', latencyMs: null, inputTokens: null, outputTokens: null, reportedCostUsd: 0, finishReason: null },
  ];
});
const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: { name: 'InjecAgent', url: 'https://github.com/uiuc-kang-lab/InjecAgent', commit: legacy.commit, license: 'MIT', sampleOffset: legacy.sampleOffset, perCategory: legacy.perCategory, sampleHash: legacy.sampleHash, promptHash: legacy.promptHash },
  cohorts: { common: '60 attacks + 60 paired template-derived benign controls', hard: '12 hand-authored benign stress cases; C4/rule have 11 valid outcomes' },
  cases: legacy.cases,
  methods: [
    { id: 'c4', name: 'C4 · Jev + policy', family: 'C4', protocol: 'Jev decision API and frozen candidate policy' },
    { id: 'action-rule', name: 'Action-keyword rules', family: 'Rules', protocol: 'Local deterministic regex' },
    ...[legacy, modern].flatMap((run) => run.models.map((model) => ({ id: model.id, name: model.name, family: run.modelSet === 'modern' ? '2026 model' : 'Earlier baseline', protocol: `Shared chat classifier prompt; ${run.maxOutputTokens} output-token cap${run.reasoningEffort ? `; ${run.reasoningEffort} reasoning effort` : ''}`, catalogPricingUsdPerToken: model.pricing, catalogAt: model.catalogAt }))),
  ],
  runs: [legacy, modern].map((run) => ({ id: run.benchmark, at: run.at, updatedAt: run.updatedAt, requestCount: run.requests, reportedCostUsd: run.reportedUsd, conservativeBudgetChargeUsd: run.budgetChargeUsd, budgetCapUsd: run.budgetCapUsd, modelIds: run.models.map((model) => model.id) })),
  attempts: [...localRows, ...legacy.results.map(take), ...modern.results.map(take)],
};
const target = join(projectRoot, 'benchmarks');
await mkdir(target, { recursive: true });
await writeFile(join(target, 'results.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Exported ${snapshot.methods.length} methods, ${snapshot.cases.length} cases, ${snapshot.attempts.length} attempt rows to benchmarks/results.json`);
