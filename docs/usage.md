# Running C4

[← Back to C4](../README.md) · [Website development](../apps/web/README.md)

## Agent setup

Requirements: Node.js 20+ and an OpenRouter key with access to `typesafe/jev-1.13`. Configure the coding agent's main model separately; C4 does not require Gemini or Vertex to run. Copy the relevant adapter from this checkout and enable it explicitly in your chosen host.

```sh
export OPENROUTER_API_KEY="..."
npm ci
npm test
C4_MODE=all pi --extension pi/c4.ts
```

For a quick live check without starting an agent, run `npm run smoke:live`. It submits a normal build log, an injected build log, and an ordinary test command through the same guard. In the 2026-09-24 smoke run, C4 returned `allow / block / allow`; the three Jev calls reported $0.000044352 in total and produced a verified three-entry audit chain. This is an integration smoke, not an attack-rate estimate.

`C4_MODE=compaction` enables only memory selection; `C4_MODE=safety` enables only input/tool reviews. The default is `all`. `C4_POLICY=balanced` is the default policy. The candidate profile is for experiments and may trigger many hard-benign reviews.

To try another host with the same key and policy:

```sh
# Claude Code: load the self-contained plugin for this session.
claude --plugin-dir ./integrations/claude/c4

# DeepSeek Harness: install the local bundle into a profile, then inspect its layer.
dsh plugin --profile c4-demo add ./integrations/deepseek/c4
dsh --profile c4-demo --dump-config
```

For OpenCode v2, add the absolute path to [`integrations/opencode/c4`](../integrations/opencode/c4) to the `plugins` array in `opencode.json(c)`. The [Codex package](../integrations/codex/c4) contains a validated plugin manifest and bundled `PreToolUse` / `PostToolUse` hooks for marketplace distribution. Codex requires the user to trust lifecycle hooks before they run. When a host cannot request C4's `ask` decision through its tool hook, the adapter denies the call rather than silently allowing it.

`npm run integrations:build` regenerates the self-contained host bundles after changing `src/`. Generated adapters are committed, so users of Claude Code and DeepSeek Harness do not need esbuild at runtime. Audit traces default to `~/.local/state/c4/<workspace-hash>/<host>/<session-hash-or-pid>/trace-v2.jsonl`. A stable session ID shares verified state across hook processes; different sessions remain isolated. `C4_AUDIT_DIR` explicitly overrides this isolation, so set it only to a directory dedicated to one session. Keep credentials out of Git: `.env`, root-level JSON credentials, runtime traces, and `.runs/` are ignored.


## Reproduce the figures and benchmark

The published result snapshot contains case IDs, labels, predictions, latencies, and usage—but **no raw attack strings, API keys, or user sessions**. The figures can be regenerated without any model calls:

```sh
python -m pip install matplotlib
npm run bench:published:verify
npm run charts
npm run bench:flow:verify
npm run charts:flow
npm run bench:agent-world:verify
npm run charts:agent-world
npm run bench:pi-host:verify
npm run charts:pi-host
```

To run a fresh 2026-model matrix, set `OPENROUTER_API_KEY`, then:

```sh
C4_OR_MODEL_SET=modern C4_OR_PLAN_ONLY=1 npm run bench:matrix
C4_OR_MODEL_SET=modern C4_OR_PILOT=1 npm run bench:matrix
C4_OR_MODEL_SET=modern npm run bench:matrix
```

The runner downloads the pinned upstream files if needed, verifies their checksums and sample hash, resumes completed cells, and enforces a per-run conservative budget cap. `C4_OR_RETRY_ERRORS=1 C4_OR_MODEL_SET=modern C4_OR_MAX_CALLS=850 npm run bench:matrix` retries only failed cells; the modern retry cap defaults to 1,024 output tokens and can be raised to 2,048 with `C4_OR_RETRY_OUTPUT_TOKENS=2048`. Caps are **per run**, so inspect the plan and adjust `C4_OR_MAX_USD` before rerunning multiple cohorts. The earlier model set is selected with `C4_OR_MODEL_SET=legacy`.

The full public snapshot was exported from local runs with `npm run bench:export`. `npm run bench:verify` checks the original disjoint InjecAgent splits; `npm run audit:verify -- <trace-path>` and `npm run policy:replay-trace -- <trace-path>` inspect any live adapter trace. Benchmark runtime records stay in `.runs/` and are not pushed.

To rerun the isolated agent tool-world with a new model call budget, set `OPENROUTER_API_KEY` and run `C4_AGENT_MAX_USD=0.25 npm run bench:agent-world`. The runner uses GLM 5.3 Flash by default, limits requests and conservatively reserves cost before each one, and never gives the model a real local secret or an external send tool. This overwrites the published agent-world snapshot; use `C4_AGENT_SNAPSHOT=agent-world-experiment.json` for a separate run. The fixed observations make this an ablation of C4's flow policy, not a live Jev latency or cost measurement.

The real Pi host run requires Pi 0.87.1 and an OpenRouter key with GLM 5.3 Flash and Jev access. `npm run bench:pi-host` runs the same synthetic task in native Pi, Pi+C4 whole-result quarantine, and Pi+C4 Fact Projection, rotating arm order and allowing at most three attempts per failed episode. It exposes only `release-note.txt` to a bounded `read` tool and sends only to a runner-owned loopback receiver. The default conservative charge cap is $0.35 (`C4_PI_HOST_MAX_USD`); a pilot with `C4_PI_HOST_MAX_CASES=1` does not replace the published full snapshot. Raw per-run artifacts stay in ignored `.runs/`.

