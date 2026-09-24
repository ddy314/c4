import { JevClient } from './jev.mjs';
import { record, readVerifiedTrace, TRACE_FILE, fingerprint } from './audit.mjs';
import { inspectToolCall, inspectToolResult } from './safety.mjs';
import { activePolicy, decidePolicy, policyHash } from './policy.mjs';
import { classifyFlowCall, evaluateFlow, flowPolicyHash, literalEvidenceHashes, hasAgentDirective } from './flow.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const QUARANTINE = '[C4 quarantined untrusted tool output. The original result was withheld from the agent.]';

export function canonicalToolName(name) {
  const lower = String(name ?? '').toLowerCase();
  if (['bash', 'powershell', 'shell', 'exec_command', 'run_code'].includes(lower)) return 'bash';
  if (['apply_patch', 'write', 'edit', 'str_replace_editor'].includes(lower)) return 'edit';
  if (['read', 'read_file'].includes(lower)) return 'read';
  return lower;
}

export function textBlocks(value, limit = 12_000) {
  const chunks = [];
  const seen = new Set();
  let remaining = limit;
  function visit(item, depth = 0) {
    if (remaining <= 0 || depth > 5 || item == null) return;
    if (typeof item === 'string') {
      const part = item.slice(0, remaining);
      chunks.push(part);
      remaining -= part.length;
      return;
    }
    if (typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
      return;
    }
    for (const key of ['text', 'stdout', 'stderr', 'output', 'content', 'result', 'message']) {
      if (Object.hasOwn(item, key)) visit(item[key], depth + 1);
    }
  }
  visit(value);
  return chunks.filter(Boolean).join('\n').slice(0, limit);
}

export function createGuard({ host, client, audit = record, sessionId, stateRoot } = {}) {
  if (!host) throw new Error('C4 guard requires a host name');
  const hostDirectory = host.replace(/[^a-z0-9_-]/gi, '-');
  const session = sessionId ?? process.env.C4_SESSION_ID;
  const sessionKey = session ? `session-${fingerprint(session)}` : String(process.pid);
  const auditDirectory = process.env.C4_AUDIT_DIR ?? join(stateRoot ?? join(homedir(), '.local', 'state', 'c4'), fingerprint(process.cwd()), hostDirectory, sessionKey);
  const tracePath = join(auditDirectory, TRACE_FILE);
  const localEntries = [];
  let activeClient = client;
  const getClient = () => (activeClient ??= new JevClient());
  async function append(event) {
    const at = new Date().toISOString();
    const hash = await audit({ ...event, sessionKey }, { directory: auditDirectory });
    if (audit !== record) localEntries.push({ ...event, sessionKey, at, hash });
    return hash;
  }
  async function history() {
    if (audit !== record) return localEntries;
    try { return (await readVerifiedTrace(tracePath)).filter((entry) => entry.host === host && entry.sessionKey === sessionKey); }
    catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  }
  return {
    auditDirectory,
    async toolCall(tool, input, { goal = '', signal } = {}) {
      const normalized = canonicalToolName(tool);
      let decision;
      try {
        const flow = classifyFlowCall(normalized, input);
        const flowRule = flow.outbound || flow.protectedRead ? evaluateFlow(flow, flow.outbound ? await history() : []) : null;
        if (flowRule) {
          const hard = { action: flowRule.action, reason: flowRule.reason };
          decision = { ...decidePolicy({ boundary: 'tool_call', probabilities: {}, hard }, activePolicy()),
            observation: { boundary: 'tool_call', probabilities: {}, hard }, probabilities: {},
            inputHash: fingerprint(JSON.stringify({ tool: normalized, input })),
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, latencyMs: 0,
            ruleId: flowRule.ruleId, parentDecisionRefs: flowRule.parentDecisionRefs };
        } else {
          decision = await inspectToolCall(normalized, input, getClient(), { goal, signal });
        }
        const decisionRef = await append({ host, boundary: 'tool_call', tool: String(tool), outcome: decision.action,
          observation: decision.observation, policyId: decision.policyId, policyHash: decision.policyHash,
          inputHash: decision.inputHash, probabilities: decision.probabilities, jev: decision.usage, latencyMs: decision.latencyMs,
          flow, flowPolicyHash, ruleId: decision.ruleId, parentDecisionRefs: decision.parentDecisionRefs });
        return { ...decision, decisionRef };
      } catch {
        return { action: 'block', reason: 'C4 tool-call screening or audit unavailable' };
      }
    },
    async toolResult(tool, output, { signal, input } = {}) {
      const text = textBlocks(output);
      if (!text) return { action: 'allow', reason: 'No text to screen' };
      try {
        const decision = await inspectToolResult(canonicalToolName(tool), [{ type: 'text', text }], getClient(), { signal });
        const untrustedOutput = decision.action === 'allow' && (decision.probabilities?.injection ?? 0) >= 0.35
          && hasAgentDirective(text);
        const flow = { protectedRead: input ? classifyFlowCall(canonicalToolName(tool), input).protectedRead : false,
          untrustedOutput, literalHashes: untrustedOutput ? literalEvidenceHashes(text) : [] };
        const decisionRef = await append({ host, boundary: 'tool_result', tool: String(tool), outcome: decision.action,
          observation: decision.observation, policyId: decision.policyId, policyHash: decision.policyHash,
          inputHash: decision.inputHash, probabilities: decision.probabilities, jev: decision.usage, latencyMs: decision.latencyMs,
          flow, flowPolicyHash });
        return { ...decision, decisionRef };
      } catch {
        return { action: 'block', reason: 'C4 result screening or audit unavailable' };
      }
    },
    async review(decisionRef, tool, approved, reviewer = 'interactive_user', input) {
      try {
        const entries = await history();
        const source = entries.find((entry) => entry.hash === decisionRef && entry.boundary === 'tool_call');
        if (!source || source.tool !== String(tool)) return false;
        if (approved) {
          if (source.outcome !== 'ask' || input === undefined) return false;
          if (source.inputHash !== fingerprint(JSON.stringify({ tool: canonicalToolName(tool), input }))) return false;
          if (source.policyHash !== policyHash(activePolicy()) || source.flowPolicyHash !== flowPolicyHash) return false;
          if (entries.some((entry) => entry.boundary === 'human_review' && entry.decisionRef === decisionRef)) return false;
          if (Date.now() - Date.parse(source.at) > 5 * 60_000) return false;
        }
        await append({ host, boundary: 'human_review', decisionRef, subject: 'tool_call', tool: String(tool),
          inputHash: source.inputHash, policyHash: source.policyHash, flowPolicyHash: source.flowPolicyHash,
          outcome: approved ? 'approved' : 'denied', reviewer });
        return approved;
      } catch {
        return false;
      }
    },
  };
}
