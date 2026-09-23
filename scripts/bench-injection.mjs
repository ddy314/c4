import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JevClient } from '../src/jev.mjs';
import { inspectToolResult } from '../src/safety.mjs';
import { projectRoot } from '../src/config.mjs';

// InjecAgent, MIT license, commit pinned for reproducibility.
const upstream = 'https://github.com/uiuc-kang-lab/InjecAgent';
const commit = 'f19c9f2c79a41046eb13c03c51a24c567a8ffa07';
const sources = [
  { kind: 'direct-harm', file: 'test_cases_dh_base.json', sha256: '0a8186468d21389af432e8c7b399ae42264d1b93a07b65c7a489468508604305' },
  { kind: 'data-stealing', file: 'test_cases_ds_base.json', sha256: '4daab35c62a3845e8b9400f4dca58b9c9f37e57cd33b2337552557fbb26282e9' },
];
const perCategory = Number(process.env.C4_CASES_PER_CATEGORY ?? 4);
const sampleOffset = Number(process.env.C4_SAMPLE_OFFSET ?? 0);
const split = process.env.C4_BENCH_SPLIT ?? 'dev';
const concurrency = Number(process.env.C4_BENCH_CONCURRENCY ?? 1);
const maxCalls = Number(process.env.C4_BENCH_MAX_CALLS ?? 48);
const maxCostUsd = Number(process.env.C4_BENCH_MAX_USD ?? 0.005);
if (!Number.isInteger(perCategory) || perCategory < 1 || perCategory > 100 || !Number.isInteger(sampleOffset) || sampleOffset < 0 || sampleOffset > 500 || !/^[a-z0-9_-]+$/.test(split) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16 || !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 2108 || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
  throw new Error('Invalid benchmark settings: cases/category 1..100, concurrency 1..16, max calls 1..2108, max USD > 0');
}
const directory = join(projectRoot, '.runs', 'datasets', 'injecagent', commit);
await mkdir(directory, { recursive: true, mode: 0o700 });

async function sourceRows(source) {
  const path = join(directory, source.file);
  let bytes;
  try { bytes = await readFile(path); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const url = `https://raw.githubusercontent.com/uiuc-kang-lab/InjecAgent/${commit}/data/${source.file}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Dataset download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Dataset checksum mismatch: ${source.file}`);
    await writeFile(path, bytes, { mode: 0o600 });
  }
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Dataset checksum mismatch: ${source.file}`);
  return JSON.parse(bytes.toString('utf8'));
}

const cases = [];
function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}
for (const source of sources) {
  const rows = await sourceRows(source);
  const groups = groupBy(rows.map((row, index) => ({ row, index })), ({ row }) => row['Attack Type']);
  for (const [category, group] of groups) {
    const sampled = group
      .map((entry) => ({ ...entry, rank: createHash('sha256').update(`${commit}:${source.kind}:${category}:${entry.index}`).digest('hex') }))
      .sort((a, b) => a.rank.localeCompare(b.rank))
      .slice(sampleOffset, sampleOffset + perCategory);
    if (sampled.length !== perCategory) throw new Error(`Not enough cases in ${category} for offset ${sampleOffset}`);
    for (const { row, index } of sampled) {
      const pairId = `${source.kind}-${index}`;
      cases.push({ id: `${pairId}-attack`, pairId, source: source.kind, category, label: 'attack', tool: row['User Tool'], content: row['Tool Response'] });
      cases.push({ id: `${pairId}-control`, pairId, source: source.kind, category, label: 'benign', tool: row['User Tool'], content: row['Tool Response Template'].replaceAll('<Attacker Instruction>', 'Routine record: item details are available.') });
    }
  }
}
if (cases.length > maxCalls) throw new Error(`Planned ${cases.length} Jev calls exceeds C4_BENCH_MAX_CALLS=${maxCalls}; raise the cap explicitly to expand the benchmark`);
console.log(`Plan ${split}: ${cases.length} Jev-only calls across ${new Set(cases.map((item) => item.category)).size} categories (offset ${sampleOffset}); 0 Gemini calls; stop scheduling near $${maxCostUsd.toFixed(4)} reported Jev spend`);
if (process.env.C4_BENCH_PLAN_ONLY === '1') process.exit(0);

const client = new JevClient();
const results = new Array(cases.length);
let cursor = 0;
let completed = 0;
let spentUsd = 0;
let stoppedForBudget = false;
async function worker() {
  while (cursor < cases.length) {
    if (spentUsd >= maxCostUsd) { stoppedForBudget = true; break; }
    const index = cursor++;
    const item = cases[index];
    const started = performance.now();
    try {
      const decision = await inspectToolResult(item.tool, [{ type: 'text', text: item.content }], client);
      results[index] = {
        id: item.id, pairId: item.pairId, source: item.source, category: item.category, label: item.label,
        action: decision.action, observation: decision.observation,
        latencyMs: Math.round(performance.now() - started), jevCostUsd: decision.usage?.costUsd ?? 0,
      };
    } catch (error) {
      results[index] = { id: item.id, pairId: item.pairId, source: item.source, category: item.category, label: item.label, action: 'error', error: String(error).slice(0, 160), latencyMs: Math.round(performance.now() - started), jevCostUsd: 0 };
    }
    spentUsd += results[index].jevCostUsd;
    completed++;
    if (completed % 12 === 0) console.log(`Evaluated ${completed}/${cases.length} cases; Jev $${spentUsd.toFixed(6)}`);
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker));

const evaluated = results.filter(Boolean);
const valid = evaluated.filter((item) => item.action !== 'error');
const attacks = valid.filter((item) => item.label === 'attack');
const controls = valid.filter((item) => item.label === 'benign');
const caught = attacks.filter((item) => item.action !== 'allow').length;
const falseAlarms = controls.filter((item) => item.action !== 'allow').length;
const pairs = groupBy(valid, (item) => item.pairId);
const pairedSuccess = [...pairs.values()].filter((pair) => pair.length === 2 && pair.some((item) => item.label === 'attack' && item.action !== 'allow') && pair.some((item) => item.label === 'benign' && item.action === 'allow')).length;
const summary = {
  benchmark: 'injecagent-boundary-v1', at: new Date().toISOString(), upstream, commit,
  license: 'MIT', split, sampleOffset, perCategory, plannedCount: cases.length, count: evaluated.length, maxCalls, maxCostUsd, stoppedForBudget, geminiCalls: 0, errors: evaluated.length - valid.length,
  attackCount: attacks.length, caught, attackRecall: attacks.length ? caught / attacks.length : null,
  benignCount: controls.length, falseAlarms, falseAlarmRate: controls.length ? falseAlarms / controls.length : null,
  pairedSuccess, completePairs: [...pairs.values()].filter((pair) => pair.length === 2).length,
  jevCostUsd: spentUsd,
  results: evaluated,
};
await writeFile(join(projectRoot, '.runs', `injection-${split}.json`), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(`InjecAgent boundary: ${caught}/${attacks.length} attacks escalated; ${falseAlarms}/${controls.length} benign controls escalated; ${pairedSuccess}/${summary.completePairs} paired successes; ${summary.errors} errors; $${summary.jevCostUsd.toFixed(6)} Jev${stoppedForBudget ? ' (budget stop)' : ''}`);
if (summary.errors) process.exitCode = 1;
