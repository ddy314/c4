import { JevClient } from './jev.mjs';
import { record } from './audit.mjs';
import { inspectToolCall, inspectToolResult } from './safety.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fingerprint } from './audit.mjs';

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

export function createGuard({ host, client, audit = record } = {}) {
  if (!host) throw new Error('C4 guard requires a host name');
  if (!process.env.C4_AUDIT_DIR) {
    const hostDirectory = host.replace(/[^a-z0-9_-]/gi, '-');
    process.env.C4_AUDIT_DIR = join(homedir(), '.local', 'state', 'c4', fingerprint(process.cwd()), hostDirectory, String(process.pid));
  }
  let activeClient = client;
  const getClient = () => (activeClient ??= new JevClient());
  return {
    async toolCall(tool, input, { goal = '', signal } = {}) {
      const normalized = canonicalToolName(tool);
      let decision;
      try {
        decision = await inspectToolCall(normalized, input, getClient(), { goal, signal });
        const decisionRef = await audit({ host, boundary: 'tool_call', tool: String(tool), outcome: decision.action,
          observation: decision.observation, policyId: decision.policyId, policyHash: decision.policyHash,
          inputHash: decision.inputHash, probabilities: decision.probabilities, jev: decision.usage, latencyMs: decision.latencyMs });
        return { ...decision, decisionRef };
      } catch {
        return { action: 'block', reason: 'C4 tool-call screening or audit unavailable' };
      }
    },
    async toolResult(tool, output, { signal } = {}) {
      const text = textBlocks(output);
      if (!text) return { action: 'allow', reason: 'No text to screen' };
      try {
        const decision = await inspectToolResult(canonicalToolName(tool), [{ type: 'text', text }], getClient(), { signal });
        await audit({ host, boundary: 'tool_result', tool: String(tool), outcome: decision.action,
          observation: decision.observation, policyId: decision.policyId, policyHash: decision.policyHash,
          inputHash: decision.inputHash, probabilities: decision.probabilities, jev: decision.usage, latencyMs: decision.latencyMs });
        return decision;
      } catch {
        return { action: 'block', reason: 'C4 result screening or audit unavailable' };
      }
    },
    async review(decisionRef, tool, approved, reviewer = 'interactive_user') {
      try {
        await audit({ host, boundary: 'human_review', decisionRef, subject: 'tool_call', tool: String(tool),
          outcome: approved ? 'approved' : 'denied', reviewer });
        return approved;
      } catch {
        return false;
      }
    },
  };
}
