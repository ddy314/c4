import { useEffect, useReducer, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  CornerDownLeft,
  FileText,
  GitBranch,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  TerminalSquare,
  X,
} from "lucide-react";
import { initialState, reducer, type Mode } from "../demo/engine";
import { modeLabels, scenarios, selectionFromUrl } from "../demo/scenarios";
import { Hint, SourceLink } from "./Primitives";

import { CharacterStream, type StreamState } from "./CharacterStream";

const actionNames = {
  allow: "Allowed",
  ask: "Review required",
  block: "Blocked",
  info: "Observation",
  quarantine: "Quarantined",
  project: "Fact recovered",
};
export function Terminal({ launch }: { launch: number }) {
  const [selection, setSelection] = useState(() =>
    selectionFromUrl(window.location.search),
  );
  const [variant, setVariant] = useState("public");
  const scenario = scenarios.find((item) => item.id === selection.scenarioId)!;
  const [state, dispatch] = useReducer(
    reducer,
    scenario.events(selection.mode),
    initialState,
  );
  const [expanded, setExpanded] = useState(false);
  const [mobileView, setMobileView] = useState("activity");
  const [command, setCommand] = useState("");
  const [feedback, setFeedback] = useState("");
  const [active, setActive] = useState(!document.hidden);
  const logRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch({
      type: "load",
      events: scenario.events(selection.mode, variant),
    });
    setFeedback("");
    setCommand("");
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", scenario.id);
    url.searchParams.set("mode", selection.mode);
    window.history.replaceState(null, "", url);
  }, [scenario, selection.mode, variant]);
  useEffect(() => {
    if (launch) {
      dispatch({ type: "reset" });
      dispatch({ type: "play" });
      sectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    }
  }, [launch]);
  useEffect(() => {
    const update = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (state.status !== "playing" || !active) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "next" }),
      state.cursor < 0 ? 350 : 1450,
    );
    return () => window.clearTimeout(timer);
  }, [state.status, state.cursor, active]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.cursor, expanded]);
  const selected = state.events[state.selected];
  const current = state.events[state.cursor];
  const selectedReview = selected && state.reviews[selected.id];
  const review = current && state.reviews[current.id];
  const start = () => {
    if (state.status === "playing") dispatch({ type: "pause" });
    else {
      if (state.status === "completed") dispatch({ type: "reset" });
      dispatch({ type: "play" });
    }
  };
  const runCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const [name, argument] = command.trim().toLowerCase().split(/\s+/);
    if (name === "help")
      setFeedback("run · next · reset · inspect <step> · help");
    else if (name === "run") {
      if (state.status === "awaiting-review")
        setFeedback("Choose Approve once or Deny to continue.");
      else {
        if (state.status === "completed") dispatch({ type: "reset" });
        dispatch({ type: "play" });
        setFeedback("");
      }
    } else if (name === "next") {
      dispatch({ type: "next" });
      setFeedback(
        state.status === "awaiting-review"
          ? "A review decision is required."
          : "",
      );
    } else if (name === "reset") {
      dispatch({ type: "reset" });
      setFeedback("Scenario reset.");
    } else if (name === "inspect") {
      const index = Number(argument) - 1;
      if (Number.isInteger(index) && index >= 0 && index <= state.cursor) {
        dispatch({ type: "select", index });
        setMobileView("evidence");
        setFeedback("");
      } else setFeedback("Use inspect <step> with a visible step number.");
    } else
      setFeedback("Unknown command. Try help for available demo commands.");
    setCommand("");
  };
  const choose = (id: string) => {
    const next = scenarios.find((item) => item.id === id)!;
    setSelection({ scenarioId: id, mode: next.defaultMode });
    setVariant("public");
    setMobileView("activity");
  };
  const content = (
    <div className={`terminal-shell ${expanded ? "is-expanded" : ""}`}>
      <header className="terminal-top">
        <div className="terminal-title">
          <span className="window-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <TerminalSquare size={14} />
          <span>C4 / control room</span>
        </div>
        <div className="terminal-top-right">
          <span className="simulation-label">
            <span /> Interactive simulation
          </span>
          {expanded ? (
            <Dialog.Close
              className="icon-button"
              aria-label="Close expanded terminal"
            >
              <X size={16} />
            </Dialog.Close>
          ) : (
            <Hint label="Expand control room">
              <button
                ref={expandRef}
                className="icon-button"
                aria-label="Expand terminal"
                onClick={() => setExpanded(true)}
              >
                <Maximize2 size={15} />
              </button>
            </Hint>
          )}
        </div>
      </header>
      <div className="terminal-workspace">
        <aside className="scenario-sidebar">
          <div className="sidebar-caption mono">
            SCENARIOS <span>04</span>
          </div>
          <div className="scenario-list">
            {scenarios.map((item, i) => (
              <button
                key={item.id}
                className={`scenario-item ${item.id === scenario.id ? "selected" : ""}`}
                onClick={() => choose(item.id)}
                aria-pressed={item.id === scenario.id}
              >
                <span className="scenario-number">0{i + 1}</span>
                <span>
                  {item.short}
                  <small>
                    {
                      [
                        "Flow Ledger",
                        "Execution boundary",
                        "Fact Projection",
                        "Normal operations",
                      ][i]
                    }
                  </small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <GitBranch size={14} />
            <span>
              One policy engine.
              <br />
              Every step connected.
            </span>
          </div>
        </aside>
        <div className="terminal-main">
          <div className="scenario-heading">
            <div>
              <span className="mono tiny">
                EXPERIMENT /{" "}
                {String(scenarios.indexOf(scenario) + 1).padStart(2, "0")}
              </span>
              <h3>{scenario.title}</h3>
            </div>
            <Tabs.Root
              className="mode-tabs"
              value={selection.mode}
              onValueChange={(mode) =>
                setSelection({ ...selection, mode: mode as Mode })
              }
            >
              <Tabs.List aria-label="Control mode">
                {scenario.modes.map((mode) => (
                  <Tabs.Trigger
                    value={mode}
                    key={mode}
                    id={`control-mode-${mode}`}
                    aria-controls="control-mode-panel"
                  >
                    {modeLabels[mode]}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs.Root>
          </div>
          <div className="terminal-signal">
            <CharacterStream
              state={
                (state.status === "awaiting-review"
                  ? "review"
                  : review === "denied" ||
                      current?.action === "block" ||
                      current?.action === "quarantine"
                    ? "block"
                    : current?.action === "project"
                      ? "project"
                      : "flow") as StreamState
              }
              paused={state.status === "paused" || state.status === "completed"}
            />
            <div className="mono">
              <span>
                SIGNAL /{" "}
                {state.status === "awaiting-review"
                  ? "HELD FOR REVIEW"
                  : state.status === "completed"
                    ? "SESSION COMPLETE"
                    : state.status === "playing"
                      ? "TRACING CROSSINGS"
                      : state.status === "paused"
                        ? "PAUSED"
                        : "READY"}
              </span>
              <span>ILLUSTRATIVE</span>
            </div>
          </div>
          {scenario.id === "ordinary" && (
            <div className="variant-toggle">
              <span>Task:</span>
              <button
                aria-pressed={variant === "public"}
                onClick={() => setVariant("public")}
              >
                Public sample
              </button>
              <button
                aria-pressed={variant === "local"}
                onClick={() => setVariant("local")}
              >
                Local tests
              </button>
            </div>
          )}
          <div
            className="mobile-terminal-tabs"
            role="group"
            aria-label="Terminal panel"
          >
            <button
              aria-pressed={mobileView === "activity"}
              onClick={() => setMobileView("activity")}
            >
              Activity
            </button>
            <button
              aria-pressed={mobileView === "evidence"}
              onClick={() => setMobileView("evidence")}
            >
              Evidence
            </button>
          </div>
          <div
            className={`terminal-panels view-${mobileView}`}
            id="control-mode-panel"
            role="tabpanel"
            aria-labelledby={`control-mode-${selection.mode}`}
            tabIndex={0}
          >
            <div className="activity-panel">
              <div className="task-prompt">
                <span className="prompt-symbol">❯</span>
                <div>
                  <span className="mono tiny">YOUR TASK</span>
                  <p>{scenario.task}</p>
                </div>
              </div>
              <div
                className="event-log"
                ref={logRef}
                aria-label="Scenario activity"
              >
                {state.cursor < 0 && (
                  <div className="ready-state">
                    <span className="ready-cross">+</span>
                    <div>
                      <p>Ready when you are.</p>
                      <span>Run the scenario. Follow the decisions.</span>
                    </div>
                    <button className="run-inline" onClick={start}>
                      Run <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {state.events.slice(0, state.cursor + 1).map((event, i) => (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      key={event.id}
                      className={`event-entry ${event.action} ${state.selected === i ? "active" : ""}`}
                    >
                      <button
                        className="event-select"
                        aria-label={`Inspect step ${i + 1}: ${event.label}`}
                        aria-pressed={state.selected === i}
                        onClick={() => dispatch({ type: "select", index: i })}
                      >
                        <span className="event-step">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="event-text">
                          <span className="event-label">{event.label}</span>
                          <code>{event.code}</code>
                        </span>
                        <span className={`decision-dot ${event.action}`} />
                      </button>
                      {state.reviews[event.id] && (
                        <div
                          className={`review-receipt ${state.reviews[event.id]}`}
                        >
                          <Check size={12} />
                          {state.reviews[event.id] === "approved"
                            ? "Approved once · this action only"
                            : "Denied · action not executed"}
                          <span>SIMULATED</span>
                        </div>
                      )}
                      {event.action === "ask" &&
                        i === state.cursor &&
                        state.status === "awaiting-review" && (
                          <div className="review-card">
                            <div>
                              <Circle size={13} />
                              <span>Your decision is required.</span>
                            </div>
                            <p>
                              {event.id === "demo-upload"
                                ? "The earlier approval covered the read. This upload needs a new decision."
                                : "Allow the agent to read this protected file once?"}
                            </p>
                            <div className="review-actions">
                              <button
                                onClick={() =>
                                  dispatch({ type: "review", approved: true })
                                }
                              >
                                Approve once <ArrowUpRight size={13} />
                              </button>
                              <button
                                onClick={() =>
                                  dispatch({ type: "review", approved: false })
                                }
                              >
                                Deny <X size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {state.status === "completed" && (
                  <div
                    className={`completion ${current?.action === "block" || review === "denied" ? "stopped" : ""}`}
                  >
                    <ShieldCheck size={16} />
                    <div>
                      <strong>
                        {current?.action === "block"
                          ? "Stopped before execution."
                          : review === "denied"
                            ? "Action denied. Session stopped."
                            : "Scenario complete."}
                      </strong>
                      <p>
                        {scenario.id === "egress" && selection.mode === "c4"
                          ? "Simulated receiver: no new receipt."
                          : review === "approved"
                            ? "The chosen action was allowed in this simulation."
                            : "Inspect a step to see the evidence behind it."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <form className="command-line" onSubmit={runCommand}>
                <span>❯</span>
                <input
                  aria-label="Demo command"
                  placeholder="Type help, or use the controls below…"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button aria-label="Run demo command" type="submit">
                  <CornerDownLeft size={14} />
                </button>
              </form>
              {feedback && (
                <div className="command-feedback" role="status">
                  {feedback}
                </div>
              )}
            </div>
            <aside className="evidence-panel">
              <div className="inspector-title mono">
                <span>
                  <FileText size={12} /> DECISION INSPECTOR
                </span>
                <span>↗</span>
              </div>
              {selected ? (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div
                    className={`decision-badge ${selectedReview === "denied" ? "block" : selectedReview === "approved" ? "allow" : selected.action}`}
                  >
                    <span />
                    {selectedReview
                      ? selectedReview === "approved"
                        ? "Approved once"
                        : "Review denied"
                      : actionNames[selected.action]}
                  </div>
                  <h4>{selected.label}</h4>
                  <p>{selected.detail}</p>
                  {selected.parent && (
                    <div className="parent-reference">
                      <GitBranch size={14} />
                      <div>
                        <span>Linked evidence</span>
                        <button
                          onClick={() =>
                            dispatch({
                              type: "select",
                              index: state.events.findIndex(
                                (event) => event.id === selected.parent,
                              ),
                            })
                          }
                        >
                          Step{" "}
                          {state.events.findIndex(
                            (event) => event.id === selected.parent,
                          ) + 1}{" "}
                          <ArrowUpRight size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                  {selected.rule && (
                    <div className="rule-reference">
                      <span className="mono tiny">RULE</span>
                      <code>{selected.rule}</code>
                    </div>
                  )}
                  <div className="demo-ref mono">
                    {selected.id}
                    <br />
                    Simulated event · not an audit hash
                  </div>
                </motion.div>
              ) : (
                <div className="inspector-empty">
                  <div className="empty-nodes">
                    <i />
                    <span />
                    <i />
                    <span />
                    <i />
                  </div>
                  <h4>Every decision has a why.</h4>
                  <p>
                    Run a scenario, then select any step to inspect its rule and
                    the evidence it connects to.
                  </p>
                  <div className="empty-detail mono">
                    <span>POLICY</span>
                    <strong>balanced</strong>
                    <span>EXECUTION</span>
                    <strong>local simulation</strong>
                  </div>
                </div>
              )}
              <div className="inspector-source">
                <span className="mono tiny">
                  {scenario.source.kind === "recorded"
                    ? "RECORDED OUTCOME"
                    : scenario.source.kind === "test"
                      ? "CONTROLLED TEST"
                      : "DESIGNED FIXTURE"}{" "}
                  / {scenario.source.caseId}
                </span>
                <SourceLink path={scenario.source.path}>
                  Inspect the source
                </SourceLink>
              </div>
            </aside>
          </div>
        </div>
      </div>
      <footer className="terminal-controls">
        <div className="playback-controls">
          <Hint label={state.status === "playing" ? "Pause" : "Run scenario"}>
            <button
              className="play-button"
              aria-label={
                state.status === "playing" ? "Pause scenario" : "Run scenario"
              }
              onClick={start}
              disabled={state.status === "awaiting-review"}
            >
              {state.status === "playing" ? (
                <Pause size={13} fill="currentColor" />
              ) : (
                <Play size={13} fill="currentColor" />
              )}
              <span>
                {state.status === "playing"
                  ? "Pause"
                  : state.status === "completed"
                    ? "Replay"
                    : state.status === "paused"
                      ? "Resume"
                      : "Run scenario"}
              </span>
            </button>
          </Hint>
          <Hint label="Advance one step">
            <button
              className="icon-button"
              aria-label="Next step"
              onClick={() => dispatch({ type: "next" })}
              disabled={["awaiting-review", "completed"].includes(state.status)}
            >
              <SkipForward size={15} />
            </button>
          </Hint>
          <Hint label="Reset scenario">
            <button
              className="icon-button"
              aria-label="Reset scenario"
              onClick={() => dispatch({ type: "reset" })}
            >
              <RotateCcw size={14} />
            </button>
          </Hint>
        </div>
        <div
          className="step-progress"
          aria-label={`Step ${state.cursor + 1} of ${state.events.length}`}
        >
          {state.events.map((event, i) => (
            <button
              disabled={i > state.cursor}
              key={event.id}
              aria-label={`Go to step ${i + 1}`}
              className={i <= state.cursor ? "filled" : ""}
              onClick={() => dispatch({ type: "select", index: i })}
            />
          ))}
          <span>
            {String(state.cursor + 1).padStart(2, "0")} /{" "}
            {String(state.events.length).padStart(2, "0")}
          </span>
        </div>
        <span className="playback-status mono" role="status">
          <i className={state.status} />
          {state.status === "awaiting-review"
            ? "AWAITING YOUR REVIEW"
            : state.status.replace("-", " ").toUpperCase()}
        </span>
      </footer>
    </div>
  );
  return (
    <div id="demo" ref={sectionRef} className="demo-section">
      <div className="demo-eyebrow">
        <span className="mono">THE INTERACTIVE CONTROL ROOM</span>
        <span>
          Choose a scenario. Take the controls. <ArrowDown size={13} />
        </span>
      </div>
      <Dialog.Root open={expanded} onOpenChange={setExpanded}>
        {expanded ? (
          <div className="terminal-placeholder">
            <TerminalSquare />
            <span>Control room expanded</span>
            <button onClick={() => setExpanded(false)}>Return to page</button>
          </div>
        ) : (
          content
        )}
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="expanded-dialog"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              window.setTimeout(
                () => expandRef.current?.focus({ preventScroll: true }),
                0,
              );
            }}
          >
            <Dialog.Title className="sr-only">
              C4 interactive control room
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Choose a scenario and follow simulated agent decisions. No
              commands are executed.
            </Dialog.Description>
            {expanded && content}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="demo-footnote">
        <span>
          <span className="small-cross">+</span> Built from real C4 fixtures and
          recorded outcomes.
        </span>
        <span>Runs locally in your browser. No API key required.</span>
      </div>
    </div>
  );
}
