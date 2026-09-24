import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpRight, Check, Minus } from "lucide-react";
import evidence from "../generated/evidence.json";
import { Evidence } from "./Sections";
import { SectionLabel, SourceLink } from "./Primitives";

type Group = "attack" | "benign" | "hard-benign";
const groups: [Group, string][] = [
  ["attack", "Attack cases"],
  ["benign", "Ordinary benign"],
  ["hard-benign", "Hard benign"],
];
function SequenceStudy({ kind }: { kind: "flow" | "world" }) {
  const [group, setGroup] = useState<Group>("attack");
  const [selected, setSelected] = useState("a01");
  const world = kind === "world";
  const rows = world
    ? evidence.world.rows.filter((r) => r.group === group && r.arm === "flow")
    : evidence.flow.allCases.filter((r) => r.group === group);
  const id = rows.some((r) => r.id === selected) ? selected : rows[0].id;
  const flowRow = evidence.flow.allCases.find((r) => r.id === id)!;
  const source = world
    ? "benchmarks/agent-world-v5-results.json"
    : "benchmarks/flow-results.json";
  return (
    <div className="sequence-study">
      <div className="study-description">
        <h3>
          {world
            ? "A model-driven, isolated tool world."
            : "The same sequences. With and without the ledger."}
        </h3>
        <p>
          {world
            ? "GLM 5.3 Flash · 36 cases × 2 arms · fixed synthetic Jev observations. The simulated reviewer denies outbound approval requests."
            : "42 synthetic regression sequences, replayed against a stateless policy and Flow Ledger. Scores are fixed; no live model is involved."}
        </p>
        <span className="mono">
          {world
            ? `${evidence.world.requests} MODEL REQUESTS · $${evidence.world.reportedUsd.toFixed(6)} REPORTED`
            : "18 ATTACK · 12 ORDINARY · 12 HARD BENIGN"}
        </span>
      </div>
      <div
        className="study-group"
        role="group"
        aria-label="Recorded case group"
      >
        {groups.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={group === key}
            onClick={() => setGroup(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="sequence-grid">
        <div className="sequence-comparison">
          {(["stateless", "flow"] as const).map((arm) => {
            const sourceRows = evidence.world.rows.filter(
              (r) => r.group === group && r.arm === arm,
            );
            const total = rows.length;
            const count = world
              ? sourceRows.filter((r) =>
                  group === "attack" ? r.leakedCanary : r.safeDelivery,
                ).length
              : evidence.flow.methods[arm][group].terminalInterventions;
            return (
              <div
                key={arm}
                className={`sequence-arm ${arm === "flow" ? "featured" : ""}`}
              >
                <div className="sequence-arm-heading">
                  <h4>{arm === "flow" ? "C4 Flow Ledger" : "Stateless"}</h4>
                  <div>
                    <strong>
                      {count}
                      <small>/{total}</small>
                    </strong>
                    <span>
                      {world
                        ? group === "attack"
                          ? "canary receipts"
                          : "safe deliveries"
                        : "terminal interventions"}
                    </span>
                  </div>
                </div>
                <div className="sequence-cells">
                  {rows.map((row) => {
                    const record = world
                      ? sourceRows.find((r) => r.id === row.id)!
                      : null;
                    const terminal = !world
                      ? evidence.flow.allCases.find((r) => r.id === row.id)![
                          arm
                        ].terminal
                      : "";
                    const label = record
                      ? record.leakedCanary
                        ? "canary received"
                        : record.safeDelivery
                          ? "safe delivery"
                          : "no safe delivery"
                      : terminal;
                    return (
                      <button
                        key={row.id}
                        className={id === row.id ? "selected" : ""}
                        aria-pressed={id === row.id}
                        aria-label={`${arm === "flow" ? "C4" : "Stateless"} ${row.id}: ${label}`}
                        onClick={() => setSelected(row.id)}
                      >
                        <span className="mono">{row.id}</span>
                        <span
                          className={`cell-outcome ${label.replaceAll(" ", "-")}`}
                        >
                          {world ? (
                            record?.safeDelivery ? (
                              <Check size={13} />
                            ) : (
                              <Minus size={13} />
                            )
                          ) : (
                            terminal
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <aside className="sequence-inspector">
          <span className="mono tiny">PAIRED RECORD</span>
          <h3>{id}</h3>
          {(["stateless", "flow"] as const).map((arm) => {
            const record = evidence.world.rows.find(
              (r) => r.id === id && r.arm === arm,
            );
            return (
              <div key={arm}>
                <h4>{arm === "flow" ? "C4 Flow Ledger" : "Stateless"}</h4>
                <dl>
                  {world && record ? (
                    <>
                      <div>
                        <dt>Safe delivery</dt>
                        <dd>{record.safeDelivery ? "Yes" : "No"}</dd>
                      </div>
                      <div>
                        <dt>Canary received</dt>
                        <dd>{record.leakedCanary ? "Yes" : "No"}</dd>
                      </div>
                      <div>
                        <dt>Model calls</dt>
                        <dd>{record.calls}</dd>
                      </div>
                      <div>
                        <dt>Review requests</dt>
                        <dd>{record.reviews}</dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>Final decision</dt>
                        <dd>{flowRow[arm].terminal}</dd>
                      </div>
                      <div>
                        <dt>Review requests</dt>
                        <dd>{flowRow[arm].reviews}</dd>
                      </div>
                      <div>
                        <dt>Model calls</dt>
                        <dd>{flowRow[arm].modelCalls}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            );
          })}
          <SourceLink path={source}>Open recorded results</SourceLink>
        </aside>
      </div>
      <div className="study-limit">
        <ArrowUpRight size={18} />
        <p>
          {world
            ? "Both arms had 0/12 canary receipts on attack cases. C4 delivered 9/12 hard-benign reports versus 12/12 stateless, with three outbound reviews denied. This measures a review/utility trade-off, not an attack-success reduction."
            : "Terminal intervention means ask or block on the last step. It is a policy outcome, not proof that an attack was prevented. Flow Ledger also intervenes in 2/12 hard-benign sequences."}
        </p>
      </div>
      <details className="benchmark-methodology">
        <summary>
          Inspect the protocol <ArrowUpRight size={15} />
        </summary>
        <div>
          <p>{world ? evidence.world.protocol : evidence.flow.protocol}</p>
          <SourceLink
            path={
              world ? "scripts/bench-agent-world.mjs" : "scripts/bench-flow.mjs"
            }
          >
            Benchmark runner
          </SourceLink>
          <SourceLink
            path={
              world ? "fixtures/agent-world.mjs" : "fixtures/flow-sequences.mjs"
            }
          >
            Case definitions
          </SourceLink>
        </div>
      </details>
    </div>
  );
}
export function StudyExplorer() {
  const [study, setStudy] = useState("pi");
  return (
    <section className="study-section section-pad" id="recorded-runs">
      <SectionLabel number="04">FOLLOW THE WHOLE SEQUENCE</SectionLabel>
      <div className="section-heading">
        <h2>
          The work still
          <br />
          <em>has to get done.</em>
        </h2>
        <p>
          Move from classifications to agent behavior.
          <br />
          Inspect individual cases, compare treatments,
          <br />
          and keep the limitations in view.
        </p>
      </div>
      <Tabs.Root value={study} onValueChange={setStudy}>
        <Tabs.List className="study-tabs" aria-label="Evaluation dataset">
          {[
            ["pi", "Real Pi host", "54 EPISODES"],
            ["flow", "Flow regression", "42 SEQUENCES"],
            ["world", "Isolated tool world", "72 EPISODES"],
          ].map(([id, label, count]) => (
            <Tabs.Trigger
              key={id}
              value={id}
              id={`study-tab-${id}`}
              aria-controls="study-panel"
            >
              <span>
                {label}
                <ArrowUpRight size={15} />
              </span>
              <small className="mono">{count}</small>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <div
        id="study-panel"
        role="tabpanel"
        aria-labelledby={`study-tab-${study}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={study}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            {study === "pi" ? (
              <Evidence />
            ) : (
              <SequenceStudy kind={study as "flow" | "world"} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
