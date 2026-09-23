import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';

for (const name of ['safety', 'memory']) {
  try {
    const result = JSON.parse(await readFile(join(projectRoot, '.runs', `${name}.json`), 'utf8'));
    if (name === 'safety') {
      console.log(`Safety: ${result.exact}/${result.n} exact, ${result.adequate}/${result.n} minimum-protection; ${result.totalLatencyMs} ms; $${result.jevCostUsd.toFixed(6)} Jev`);
      for (const item of result.records.filter((row) => !row.exact)) console.log(`  ${item.id}: ${item.expected} -> ${item.actual}`);
    } else {
      console.log(`Memory: ${result.retainedCount}/${result.requiredCount} required facts; $${result.jevCostUsd.toFixed(6)} Jev`);
      for (const item of result.records) console.log(`  ${item.id}: ${item.required?.filter((row) => row.retained).length ?? 0}/${item.required?.length ?? 0} facts, ${item.sourceChars ?? '-'} -> ${item.summaryChars ?? '-'} chars`);
    }
  } catch (error) {
    console.log(`${name}: no result yet (${error.code ?? error.message})`);
  }
}

try {
  const result = JSON.parse(await readFile(join(projectRoot, '.runs', 'pi-ab.json'), 'utf8'));
  console.log(`Pi A/B: ${result.model}`);
  for (const item of result.arms) {
    if (item.error) console.log(`  ${item.mode}: ERROR ${item.error}`);
    else console.log(`  ${item.mode}: ${item.retained.filter(Boolean).length}/${result.facts.length} facts, compaction ${item.compactLatencyMs} ms, wall ${item.elapsedMs} ms, total $${item.totalCostUsd.toFixed(6)}, context after ${item.compaction.estimatedTokensAfter} tokens`);
  }
} catch (error) {
  console.log(`Pi A/B: no result yet (${error.code ?? error.message})`);
}

for (const split of ['dev', 'holdout']) {
  try {
    const result = JSON.parse(await readFile(join(projectRoot, '.runs', `injection-${split}.json`), 'utf8'));
    console.log(`InjecAgent ${split}: ${result.caught}/${result.attackCount} attacks escalated, ${result.falseAlarms}/${result.benignCount} paired controls escalated, ${result.errors} errors; Jev $${result.jevCostUsd.toFixed(6)}, Gemini calls ${result.geminiCalls}`);
  } catch (error) {
    console.log(`InjecAgent ${split}: no result yet (${error.code ?? error.message})`);
  }
}
try {
  const result = JSON.parse(await readFile(join(projectRoot, '.runs', 'holdout-policy.json'), 'utf8'));
  console.log(`Frozen policy holdout: baseline ${result.balanced.caught}/${result.balanced.attackCount} attacks vs candidate ${result.calibrated.caught}/${result.calibrated.attackCount}; candidate false alarms ${result.calibrated.falseAlarms}/${result.calibrated.benignCount}; replay used ${result.modelCalls} model calls`);
} catch (error) {
  console.log(`Frozen policy holdout: no result yet (${error.code ?? error.message})`);
}
