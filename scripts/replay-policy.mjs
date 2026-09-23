import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { POLICIES, replay } from '../src/policy.mjs';
import { projectRoot } from '../src/config.mjs';

const source = JSON.parse(await readFile(join(projectRoot, '.runs', 'injection-dev.json'), 'utf8'));
const records = source.results.filter((item) => item.observation);
const reports = [];
for (const [name, policy] of Object.entries(POLICIES)) {
  const replayed = replay(records, policy);
  const joined = replayed.map((row, index) => ({ ...row, label: records[index].label }));
  const attacks = joined.filter((row) => row.label === 'attack');
  const controls = joined.filter((row) => row.label === 'benign');
  reports.push({
    policy: name, policyId: policy.id, n: joined.length,
    attackRecall: attacks.filter((row) => row.next !== 'allow').length / attacks.length,
    falseAlarmRate: controls.filter((row) => row.next !== 'allow').length / controls.length,
    changedDecisions: joined.filter((row) => row.changed).length,
    actions: Object.fromEntries(['allow', 'ask', 'block'].map((action) => [action, joined.filter((row) => row.next === action).length])),
  });
}
const output = { sourceBenchmark: source.benchmark, sourceCommit: source.commit, at: new Date().toISOString(), modelCalls: 0, reports };
await writeFile(join(projectRoot, '.runs', 'replay.json'), `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
for (const item of reports) console.log(`${item.policy}: attack recall ${(item.attackRecall * 100).toFixed(1)}%, false alarms ${(item.falseAlarmRate * 100).toFixed(1)}%, changed ${item.changedDecisions}/${item.n}`);
