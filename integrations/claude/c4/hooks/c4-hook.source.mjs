import { runHook } from '../../../../src/host-hooks.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let input;
try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
catch { input = { hook_event_name: 'PreToolUse' }; }
process.stdout.write(`${JSON.stringify(await runHook('claude', input))}\n`);
