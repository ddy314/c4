import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import sequences from '../fixtures/flow-sequences.mjs';
import { createGuard, canonicalToolName } from '../src/guard.mjs';
import { inspectToolCall, inspectToolResult } from '../src/safety.mjs';

const OUTPUT = new URL('../benchmarks/flow-results.json', import.meta.url);

function fixedClient(getRisk, counter) {
  return { async decide(_state, questions) {
    counter.calls++;
    const noul = getRisk();
    return { answers: Object.fromEntries(Object.keys(questions).map((key) => [key, { type: 'noul', noul }])),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, latencyMs: 0 };
  } };
}

function summarize(cases, method) {
  const groups = {};
  for (const group of ['attack', 'benign', 'hard-benign']) {
    const rows = cases.filter((item) => item.group === group);
    groups[group] = { total: rows.length,
      terminalInterventions: rows.filter((item) => item[method].terminal !== 'allow').length,
      reviewRequests: rows.reduce((sum, item) => sum + item[method].reviews, 0),
      modelCalls: rows.reduce((sum, item) => sum + item[method].modelCalls, 0) };
  }
  return groups;
}

export async function evaluateSuite() {
  if (process.env.C4_POLICY && process.env.C4_POLICY !== 'balanced') throw new Error('Flow regression suite requires C4_POLICY=balanced');
  const seen = new Set();
  const cases = [];
  for (const item of sequences) {
    if (seen.has(item.id) || !item.events.length) throw new Error(`Invalid sequence ${item.id}`);
    seen.add(item.id);
    let probability = 0.1;
    const statelessCounter = { calls: 0 };
    const flowCounter = { calls: 0 };
    let auditCount = 0;
    const statelessClient = fixedClient(() => probability, statelessCounter);
    const guard = createGuard({ host: 'flow-benchmark', client: fixedClient(() => probability, flowCounter),
      audit: async () => `seq-${item.id}-${++auditCount}` });
    let statelessReviews = 0;
    let flowReviews = 0;
    let statelessTerminal;
    let flowTerminal;
    let ruleId = null;
    for (const [index, event] of item.events.entries()) {
      probability = event.jev;
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error(`Invalid fixed observation in ${item.id}`);
      let stateless;
      let flow;
      if (event.kind === 'result') {
        stateless = await inspectToolResult(canonicalToolName(event.tool), [{ type: 'text', text: event.text }], statelessClient);
        flow = await guard.toolResult(event.tool, event.text, { input: event.input });
      } else if (event.kind === 'call') {
        stateless = await inspectToolCall(canonicalToolName(event.tool), event.input, statelessClient);
        flow = await guard.toolCall(event.tool, event.input);
        if (stateless.action === 'ask') statelessReviews++;
        if (flow.action === 'ask') flowReviews++;
        if (event.approve) {
          if (flow.action !== 'ask'
            || !await guard.review(flow.decisionRef, event.tool, true, 'benchmark_simulated_user', event.input)) {
            throw new Error(`Expected approved precondition in ${item.id}`);
          }
        }
      } else throw new Error(`Unknown event kind in ${item.id}`);
      if (index === item.events.length - 1) {
        if (event.kind !== 'call') throw new Error(`Terminal event must be a tool call in ${item.id}`);
        statelessTerminal = stateless.action;
        flowTerminal = flow.action;
        ruleId = flow.ruleId ?? null;
      }
    }
    cases.push({ id: item.id, group: item.group, family: item.family, steps: item.events.length,
      stateless: { terminal: statelessTerminal, reviews: statelessReviews, modelCalls: statelessCounter.calls },
      flow: { terminal: flowTerminal, reviews: flowReviews, modelCalls: flowCounter.calls, ruleId } });
  }
  return { protocol: 'C4 hand-authored flow regression v1; fixed synthetic Jev observations; ask counts as terminal intervention, not proven prevention',
    fixture: 'fixtures/flow-sequences.mjs',
    methods: { stateless: summarize(cases, 'stateless'), flow: summarize(cases, 'flow') }, cases };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evaluated = await evaluateSuite();
  if (process.argv.includes('--verify')) {
    const published = JSON.parse(await readFile(OUTPUT, 'utf8'));
    if (JSON.stringify(published) !== JSON.stringify(evaluated)) throw new Error('Flow benchmark snapshot differs from fixtures or evaluator');
    console.log(`Verified ${evaluated.cases.length} flow regression sequences.`);
  } else {
    await writeFile(OUTPUT, `${JSON.stringify(evaluated, null, 2)}\n`);
    console.log(JSON.stringify(evaluated.methods, null, 2));
  }
}
