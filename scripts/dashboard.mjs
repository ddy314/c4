import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.mjs';

const runDir = join(projectRoot, '.runs');
const load = async (name) => JSON.parse(await readFile(join(runDir, name), 'utf8'));
const [safety, memory, pi] = await Promise.all(['safety.json', 'memory.json', 'pi-ab.json'].map(load));
const [external, holdoutPolicy] = await Promise.all(['injection-holdout.json', 'holdout-policy.json'].map(load));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (value) => `$${Number(value ?? 0).toFixed(6)}`;
const native = pi.arms.find((arm) => arm.mode === 'native');
const c4 = pi.arms.find((arm) => arm.mode === 'c4');
const pct = (a, b) => Number.isFinite(a) && Number.isFinite(b) && b > 0 ? `${Math.round((1 - a / b) * 100)}%` : '—';
const safeRows = safety.records.map((row) => `<tr><td>${esc(row.id)}</td><td>${esc(row.boundary)}</td><td><span class="pill ${esc(row.actual)}">${esc(row.actual)}</span></td><td>${esc(row.expected)}</td><td>${row.exact ? 'exact' : row.adequate ? 'stronger' : 'miss'}</td><td>${esc(row.latencyMs ?? '—')}</td><td>${money(row.jevCostUsd)}</td></tr>`).join('');
const memoryRows = memory.records.map((row) => `<tr><td>${esc(row.id)}</td><td>${row.required?.filter((fact) => fact.retained).length ?? 0}/${row.required?.length ?? 0}</td><td>${esc(row.sourceChars ?? '—')}</td><td>${esc(row.summaryChars ?? '—')}</td><td>${money(row.jev?.costUsd)}</td></tr>`).join('');
const armRows = pi.arms.map((arm) => arm.error
  ? `<tr><td>${esc(arm.mode)}</td><td colspan="5">${esc(arm.error)}</td></tr>`
  : `<tr><td>${esc(arm.mode)}</td><td>${arm.retained.filter(Boolean).length}/${pi.facts.length}</td><td>${arm.compactLatencyMs} ms</td><td>${arm.elapsedMs} ms</td><td>${money(arm.totalCostUsd)}</td><td>${esc(arm.compaction.estimatedTokensAfter)} tokens</td></tr>`).join('');
const externalRows = [
  { name: 'Fixed balanced policy', ...holdoutPolicy.balanced },
  { name: 'Frozen candidate policy', ...holdoutPolicy.calibrated },
].map((row) => `<tr><td>${esc(row.name)}</td><td>${row.caught}/${row.attackCount}</td><td>${row.falseAlarms}/${row.benignCount}</td><td>${esc(external.count)} evaluated</td><td>${money(external.jevCostUsd)} Jev · 0 Gemini</td></tr>`).join('');
const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C4 · Decision audit</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0c111b;color:#e6edf8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0%,#1e3551 0,transparent 34%),#0c111b}main{max-width:1150px;margin:auto;padding:48px 24px 80px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:40px}.brand{font-size:28px;font-weight:800;letter-spacing:-.04em}.brand span{color:#61dcba}.tag{border:1px solid #4a6780;border-radius:99px;padding:8px 14px;color:#a7c6dd;font-size:13px}h1{font-size:clamp(34px,5vw,58px);line-height:1.04;letter-spacing:-.055em;max-width:840px;margin:0 0 16px}h1 em{font-style:normal;color:#61dcba}p{color:#9fb0c7;line-height:1.6}.lead{font-size:17px;max-width:760px;margin-bottom:34px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:42px}.metric,.panel{background:#121e2e;border:1px solid #26364b;border-radius:17px}.metric{padding:22px}.metric b{display:block;font-size:30px;letter-spacing:-.04em}.metric small{display:block;color:#9fb0c7;margin-top:8px;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.panels{display:grid;gap:24px}.panel{padding:24px;overflow-x:auto}h2{margin:0 0 6px;font-size:22px;letter-spacing:-.025em}.sub{margin:0 0 18px;font-size:13px}table{border-collapse:collapse;width:100%;min-width:680px;font-size:13px}th{text-align:left;color:#88a0bb;font-weight:600;border-bottom:1px solid #34475c;padding:12px 10px}td{border-bottom:1px solid #26364b;padding:12px 10px}tr:last-child td{border:0}.pill{border-radius:99px;padding:4px 9px;background:#263b49;color:#9fe3ca}.pill.ask,.pill.review{background:#514120;color:#ffdd8a}.pill.block{background:#522a35;color:#ff9aaf}.pill.error{background:#522a35;color:#ff9aaf}.note{margin-top:24px;font-size:12px;color:#7790ab}code{color:#b6dbf2}@media(max-width:760px){main{padding:28px 16px}.metrics{grid-template-columns:repeat(2,1fr)}header{align-items:flex-start;flex-direction:column}}
</style>
<main><header><div class="brand">C<span>4</span></div><div class="tag">Evidence-aware agent control · local report</div></header>
<h1>Every agent transition deserves a <em>decision trail.</em></h1>
<p class="lead">Gemini remains the coding agent. Jev scores narrow safety and memory decisions; Pi executes or blocks. This report is generated from local benchmark artifacts, not a live production claim.</p>
<div class="metrics"><div class="metric"><b>${holdoutPolicy.calibrated.caught}/${holdoutPolicy.calibrated.attackCount}</b><small>Held-out attacks escalated</small></div><div class="metric"><b>${holdoutPolicy.calibrated.falseAlarms}/${holdoutPolicy.calibrated.benignCount}</b><small>Paired controls escalated</small></div><div class="metric"><b>${money(external.jevCostUsd)}</b><small>Holdout Jev cost · 0 Gemini</small></div><div class="metric"><b>${safety.adequate}/${safety.n}</b><small>Minimum-protection fixtures</small></div><div class="metric"><b>${memory.retainedCount}/${memory.requiredCount}</b><small>Memory facts retained</small></div><div class="metric"><b>${pct(c4?.totalCostUsd,native?.totalCostUsd)}</b><small>Single-run Pi cost change</small></div></div>
<div class="panels"><section class="panel"><h2>Same-host A/B · ${esc(pi.model)}</h2><p class="sub">One no-tool trial per arm · identical prompts and compaction settings · lower is better for time/cost</p><table><thead><tr><th>Pi mode</th><th>Facts</th><th>Compaction</th><th>Whole run</th><th>Total API cost</th><th>Context after</th></tr></thead><tbody>${armRows}</tbody></table></section>
<section class="panel"><h2>Frozen-policy holdout · InjecAgent</h2><p class="sub">Candidate threshold was selected on 48 development cases before scoring these 96 non-overlapping cases. Paired benign outputs are constructed from the upstream templates; this is boundary detection, not full agent attack success.</p><table><thead><tr><th>Policy</th><th>Attacks escalated</th><th>Benign controls escalated</th><th>Holdout size</th><th>API spend</th></tr></thead><tbody>${externalRows}</tbody></table></section>
<section class="panel"><h2>Safety routing</h2><p class="sub">Input, pre-tool, and untrusted-result boundaries. <code>ask</code> means human review; <code>block</code> stops execution.</p><table><thead><tr><th>Case</th><th>Boundary</th><th>Decision</th><th>Expected</th><th>Match</th><th>ms</th><th>Jev cost</th></tr></thead><tbody>${safeRows}</tbody></table></section>
<section class="panel"><h2>Extractive memory</h2><p class="sub">Original source snippets are selected with local IDs; short sessions can grow because the provenance wrapper has overhead.</p><table><thead><tr><th>Case</th><th>Facts</th><th>Source chars</th><th>Summary chars</th><th>Jev cost</th></tr></thead><tbody>${memoryRows}</tbody></table></section></div>
<p class="note">The paired controls are synthetic and the Pi A/B result is one trial. Neither result establishes production safety. Logs omit raw prompt and tool-output content. Generated ${esc(new Date().toISOString())}.</p></main></html>`;
const output = join(runDir, 'dashboard.html');
await writeFile(output, page, { mode: 0o600 });
console.log(output);
