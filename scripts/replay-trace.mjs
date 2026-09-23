import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TRACE_FILE, verifyTrace } from '../src/audit.mjs';
import { POLICIES, decidePolicy } from '../src/policy.mjs';
import { projectRoot } from '../src/config.mjs';

const path = process.argv[2] ?? join(projectRoot, '.runs', TRACE_FILE);
const profile = process.argv[3] ?? 'candidate';
const policy = POLICIES[profile];
if (!policy) throw new Error(`Unknown policy profile: ${profile}`);
const integrity = await verifyTrace(path);
if (!integrity.valid) throw new Error(`Refusing to replay invalid trace: ${integrity.error}`);
const entries = (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const decisions = entries.filter((entry) => entry.observation).map((entry) => {
  const next = decidePolicy(entry.observation, policy);
  return { eventHash: entry.hash, at: entry.at, boundary: entry.boundary, priorPolicy: entry.policyId, prior: entry.outcome, next: next.action, changed: entry.outcome !== next.action, score: next.score };
});
const reviews = entries.filter((entry) => entry.boundary === 'human_review');
const result = { source: path, sourceHead: integrity.head, profile, policyId: policy.id, verifiedEntries: integrity.count, replayedDecisions: decisions.length, changedDecisions: decisions.filter((item) => item.changed).length, reviews: { approved: reviews.filter((entry) => entry.outcome === 'approved').length, denied: reviews.filter((entry) => entry.outcome === 'denied').length }, modelCalls: 0, toolCalls: 0, decisions };
await writeFile(join(projectRoot, '.runs', 'trace-replay.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(`Verified ${integrity.count} audit entries; replayed ${decisions.length} decisions under ${policy.id}; ${result.changedDecisions} changes; reviews ${result.reviews.approved} approved / ${result.reviews.denied} denied; 0 model or tool calls`);
