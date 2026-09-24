import { createGuard, textBlocks, QUARANTINE } from '../../../src/guard.mjs';

export const name = 'dsh-plugin-c4';
export const inject = ['tools'];

export function apply(ctx) {
  const guard = createGuard({ host: 'deepseek-harness' });
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await guard.toolCall(exec.name, exec.arguments, { signal: exec.signal });
    if (decision.action === 'allow') return next();
    if (decision.action === 'ask') return { kind: 'ask', reason: decision.reason };
    return { kind: 'deny', reason: decision.reason };
  });
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (result.isError || !textBlocks(result.content)) return next();
    const decision = await guard.toolResult(exec.name, result.content, { signal: exec.signal, input: exec.arguments });
    if (decision.action === 'allow') return next();
    // A content-only replacement leaves the structured value available to nested callers.
    return { kind: 'block', feedback: [{ type: 'text', text: QUARANTINE }] };
  });
}
