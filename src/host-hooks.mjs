import { createGuard, QUARANTINE } from './guard.mjs';

function errorDecision(host, event, input = {}) {
  if (event === 'PreToolUse') {
    if (host === 'codex') return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'C4 screening unavailable' } };
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'C4 screening unavailable' } };
  }
  return host === 'codex' ? { decision: 'block', reason: 'C4 result screening unavailable' } : { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: redactResult(input.tool_response ?? {}) } };
}

function redactResult(value) {
  if (typeof value === 'string') return QUARANTINE;
  if (Array.isArray(value)) return value.map(redactResult);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (['type', 'filePath', 'file_path', 'path', 'name', 'mimeType', 'isImage', 'interrupted', 'exitCode', 'status'].includes(key)) return [key, child];
      return [key, redactResult(child)];
    }));
  }
  return value;
}

export async function handleHook(host, input, guard = createGuard({ host })) {
  const event = input?.hook_event_name;
  const tool = input?.tool_name ?? '';
  if (!['PreToolUse', 'PostToolUse'].includes(event)) return {};
  if (!tool) return errorDecision(host, event, input);
  if (event === 'PreToolUse') {
    const decision = await guard.toolCall(tool, input.tool_input ?? {}, { goal: '' });
    if (decision.action === 'allow') return {};
    if (host === 'claude' && decision.action === 'ask') {
      return { hookSpecificOutput: { hookEventName: event, permissionDecision: 'ask', permissionDecisionReason: decision.reason } };
    }
    // Codex currently does not support the ask decision in PreToolUse; deny rather than silently allow.
    return { hookSpecificOutput: { hookEventName: event, permissionDecision: 'deny', permissionDecisionReason: decision.reason } };
  }
  const decision = await guard.toolResult(tool, input.tool_response ?? input.tool_output ?? {});
  if (decision.action === 'allow') return {};
  if (host === 'codex') return { decision: 'block', reason: `${QUARANTINE} ${decision.reason}` };
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: redactResult(input.tool_response ?? {}),
    additionalContext: decision.action === 'ask' ? 'C4 withheld a tool result pending review.' : 'C4 quarantined a tool result.' } };
}

export async function runHook(host, input) {
  try {
    return await handleHook(host, input);
  } catch {
    return errorDecision(host, input?.hook_event_name, input);
  }
}
