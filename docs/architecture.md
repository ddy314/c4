# Architecture

[← Back to C4](../README.md) · [Interactive mechanism](https://ddy314.github.io/c4/#how-it-works)

## What C4 adds beyond Jev

The [Flow Ledger](../src/flow.mjs) joins tool results, protected reads, local staging, and outbound actions across a five-minute session window. It records hashed artifact references and parent decision references, then applies a deterministic rule **before** another API call. A legitimate `.env` read can be approved, but that approval does not silently authorize a later upload. For text-sending tools, a medium-risk result becomes flow evidence only when it contains an agent-directed verb, and extra review fires only if the outgoing text repeats a high-signal literal from that result; a safe status summary can proceed. File uploads remain conservative because the hook cannot see their contents. Ordinary local work, read-only web fetches, and public sample files can continue. This is a deliberately narrow classifier, not a complete shell interpreter or information-flow proof. Literal `python -c` and `node -e` read-and-send forms are covered, but dynamically constructed/encoded code, scripts on disk, and other unparsed shell forms can still evade it. Path and literal hashes are deterministic identifiers, not anonymization against dictionary guesses.

Pi's [Fact Projection](../src/projection.mjs) addresses a cost of quarantining an entire suspicious tool result: losing harmless facts along with the injected instructions. For an injection-scored `ask` or `block` on a **non-protected `read`**, C4 can extract at most three short scalar facts from operational fields such as `status`, `result`, or `count`, wrap them as explicitly untrusted JSON data, and withhold the original text. It records a hash-linked projection event without storing the raw output. Protected reads, credential hard blocks, screening failures, arbitrary prose, and free-form values still get no projection. This is a narrow extractive transform, not a claim that source facts are true or that all injections can be safely sanitized; the new behavior is currently wired into Pi, while the extractor is host-independent. Set `C4_RESULT_PROJECTION=off` to retain strict whole-result quarantine.

C4-issued approvals are bound to the exact tool name and input hash, expire after five minutes, and cannot be reused. [Audit verification](../src/audit.mjs) checks the binding and hash chain; a cross-process lock lets command hooks append to the same session trace without corrupting it. Claude Code and DeepSeek Harness own their native approval UI, so C4 conservatively treats an unresolved protected-read `ask` as possible exposure; this can add review after a denied read. When Codex or Claude Code supplies `session_id`, their separate hook processes use the same hashed session directory; `C4_SESSION_ID` can supply one explicitly. Without a stable ID, C4 falls back to process-local state and does **not** claim cross-process tracking. Pi, OpenCode, and DeepSeek Harness use the same guard in their long-running process.

## How C4 works

```text
User intent ──[1]──> Agent ──[2]──> Tool ──[3]──> External evidence
                         │                         │
                         └────────[4] compaction──┘
                                   │
                 Jev → policy → Flow Ledger → host-native control
                                   └→ hash-linked audit / replay
```

- **Policy, not a raw model verdict.** Jev returns structured probabilities. [Versioned policies](../src/policy.mjs) map them to `allow`, `ask`, or `block`; hard rules can block obvious credential exfiltration. The candidate threshold is opt-in with `C4_POLICY=candidate`.
- **Governance evidence.** Guard [audit records](../src/audit.mjs) contain hashes, action, policy ID/hash, flow-rule and parent references, probabilities, timing, and usage, but omit raw prompts, commands, paths, and tool output. Review approvals/denials refer to a decision hash. [Trace replay](../scripts/replay-trace.mjs) tests another probability policy without rerunning a tool or model; it does not recompute Flow Ledger state.
- **Fail-closed safety boundaries.** Failed tool-call screening blocks execution; failed tool-result screening quarantines or blocks the result. Pi withholds the original `ask`/`block` tool output; only injection-scored, non-protected `read` results may yield bounded scalar facts through Fact Projection. A failed memory check falls back to native Pi compaction. Non-interactive requests requiring review are denied. Native `ask` paths in Claude Code and DeepSeek Harness are host-owned; C4 records the pending decision but does not claim a C4-issued approval receipt for those hosts.
- **Constrained memory.** [Extractive selection](../src/memory.mjs) retains source-identified transcript fragments within a character budget. It does not invent a free-form summary.

This remains a research prototype. Pattern-based secret detection and redaction are best-effort, and a local hash chain alone is not externally anchored or signed.

