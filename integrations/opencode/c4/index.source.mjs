import { createGuard, textBlocks, QUARANTINE } from '../../../src/guard.mjs';

export default {
  id: 'c4.guard',
  async setup(ctx) {
    const guard = createGuard({ host: 'opencode' });
    await ctx.tool.hook('execute.before', async (event) => {
      const decision = await guard.toolCall(event.tool, event.input);
      if (decision.action !== 'allow') throw new Error(`C4 ${decision.action}: ${decision.reason}`);
    });
    await ctx.tool.hook('execute.after', async (event) => {
      if (event.status !== 'completed' || !textBlocks(event.result?.content)) return;
      const decision = await guard.toolResult(event.tool, event.result.content, { input: event.input });
      if (decision.action !== 'allow') event.result = { ...event.result, content: QUARANTINE };
    });
  },
};
