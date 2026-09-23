import { createHash } from 'node:crypto';

export const POLICIES = Object.freeze({
  balanced: Object.freeze({
    id: 'balanced-v2',
    thresholds: { input: { review: 0.65 }, tool_call: { review: 0.65, block: 0.92 }, tool_result: { review: 0.65, block: 0.92 } },
  }),
  cautious: Object.freeze({
    id: 'cautious-v2',
    thresholds: { input: { review: 0.45 }, tool_call: { review: 0.45, block: 0.8 }, tool_result: { review: 0.45, block: 0.8 } },
  }),
  permissive: Object.freeze({
    id: 'permissive-v2',
    thresholds: { input: { review: 0.8 }, tool_call: { review: 0.8, block: 0.98 }, tool_result: { review: 0.8, block: 0.98 } },
  }),
  candidate: Object.freeze({
    id: 'candidate-injecagent-dev-v1',
    trainedOn: '0480d9ea9d5a1bfb19299ea8129b967b0572a23e530d8ff8d110348dd5b1e4a8',
    thresholds: { input: { review: 0.65 }, tool_call: { review: 0.65, block: 0.92 }, tool_result: { review: 0.115, block: 0.92 } },
  }),
});

export function activePolicy() {
  const name = process.env.C4_POLICY ?? 'balanced';
  if (!Object.hasOwn(POLICIES, name)) throw new Error(`Unknown C4_POLICY: ${name}`);
  return POLICIES[name];
}

export function policyHash(policy) {
  return createHash('sha256').update(JSON.stringify(policy)).digest('hex').slice(0, 16);
}

export function decidePolicy(observation, policy = POLICIES.balanced) {
  const { boundary, probabilities = {}, hard = null } = observation;
  const threshold = policy.thresholds[boundary];
  if (!threshold) throw new Error(`Unsupported boundary: ${boundary}`);
  const values = Object.values(probabilities);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error('Invalid probability in observation');
  }
  const score = values.length ? Math.max(...values) : 0;
  let action = 'allow';
  let reason = 'Below review threshold';
  if (hard?.action === 'block') { action = 'block'; reason = hard.reason; }
  else if (threshold.block !== undefined && score >= threshold.block) { action = 'block'; reason = 'Risk above block threshold'; }
  else if (hard?.action === 'ask' || score >= threshold.review) { action = 'ask'; reason = hard?.reason ?? 'Risk requires human review'; }
  return { action, reason, score, policyId: policy.id, policyHash: policyHash(policy) };
}

export function replay(records, policy = POLICIES.balanced) {
  return records.map((record) => {
    if (!record.observation) return { id: record.id, error: 'Missing observation' };
    const decision = decidePolicy(record.observation, policy);
    return { id: record.id, previous: record.action ?? record.actual ?? record.outcome, next: decision.action, changed: (record.action ?? record.actual ?? record.outcome) !== decision.action, score: decision.score };
  });
}
