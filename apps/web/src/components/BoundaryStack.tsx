import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ArrowDown, ArrowRight, GitBranch } from "lucide-react";
import { useReducedEffects } from "../useReducedEffects";
import { CharacterStream, type StreamState } from "./CharacterStream";
import { SectionLabel, SourceLink } from "./Primitives";

const boundaries = [
  {
    name: "Intent",
    title: "Start with the instruction.",
    text: "Establish the task before the agent starts. C4 reviews incoming instructions at Pi’s input boundary.",
    from: "USER INSTRUCTION",
    to: "INPUT REVIEW",
    code: "user.intent → review → agent",
    path: "pi/c4.ts",
    states: ["flow", "review"],
    choices: ["Continue", "Review"],
    lines: [
      "scope     user instruction",
      "boundary  before inference",
      "decision  policy controlled",
    ],
  },
  {
    name: "Action",
    title: "Remember what came before.",
    text: "A sensitive read can matter several steps later. The Flow Ledger connects earlier evidence to the next proposed side effect.",
    from: "PROPOSED TOOL CALL",
    to: "EXECUTION BOUNDARY",
    code: "protected.read → outbound.action → ask",
    path: "src/flow.mjs",
    states: ["review", "block"],
    choices: ["Review gate", "Hard block"],
    lines: [
      "evidence  protected read",
      "next      outbound action",
      "window    five-minute session",
    ],
  },
  {
    name: "Evidence",
    title: "Recover the useful fragment.",
    text: "Quarantine suspicious instructions. For eligible, non-protected reads, extract bounded scalar facts and preserve them as untrusted data.",
    from: "UNTRUSTED TOOL RESULT",
    to: "BOUNDED FACTS",
    code: 'read.result → { "status": "yellow" }',
    path: "src/projection.mjs",
    states: ["project", "block"],
    choices: ["Project facts", "Quarantine"],
    lines: [
      "extract   ≤ 3 scalar facts",
      "trust     explicitly untrusted",
      "exclude   protected reads / prose",
    ],
  },
  {
    name: "Context",
    title: "Carry the thread forward.",
    text: "Select source-identified transcript fragments within a budget. Pi’s extractive compaction keeps provenance attached to the retained context.",
    from: "SESSION TRANSCRIPT",
    to: "SELECTED CONTEXT",
    code: "transcript → source fragments → context",
    path: "src/memory.mjs",
    states: ["context", "flow"],
    choices: ["Selected context", "Full stream"],
    lines: [
      "method    extractive selection",
      "budget    bounded context",
      "preserve  source references",
    ],
  },
] as const;
function StackCard({
  index,
  progress,
}: {
  index: number;
  progress: MotionValue<number>;
}) {
  const item = boundaries[index];
  const [choice, setChoice] = useState(0);
  const alternateCodes = [
    "user.intent → ask → human review",
    "credential.egress → block → no execution",
    "read.result → quarantine → withhold",
    "transcript → full source stream",
  ];
  const reduced = useReducedEffects();
  const scale = useTransform(
    progress,
    [index * 0.22, (index + 1) * 0.22],
    [1, index === 3 ? 1 : 0.955],
  );
  return (
    <motion.article
      id={`boundary-${index}`}
      className={`boundary-card boundary-card-${index}`}
      style={{
        top: `calc(var(--stack-top) + ${index * 15}px)`,
        scale: reduced ? 1 : scale,
      }}
    >
      <div className="stack-card-top mono">
        <span>
          0{index + 1} / {item.name.toUpperCase()}
        </span>
        <span>
          BOUNDARY CONTROL <GitBranch size={14} />
        </span>
      </div>
      <div className="stack-card-body">
        <div className="stack-card-copy">
          <h3>{item.title}</h3>
          <p>{item.text}</p>
          <SourceLink path={item.path}>
            Explore {item.name.toLowerCase()}
          </SourceLink>
        </div>
        <div className="boundary-instrument">
          <div className="instrument-labels mono">
            <span>{item.from}</span>
            <ArrowRight size={14} />
            <span>{item.to}</span>
          </div>
          <CharacterStream large state={item.states[choice] as StreamState} />
          <div className="instrument-readout">
            <code aria-live="polite">
              {choice === 0 ? item.code : alternateCodes[index]}
            </code>
            <div>
              {item.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          </div>
          <div
            className="instrument-options"
            role="group"
            aria-label={`${item.name} visual mode`}
          >
            {item.choices.map((label, i) => (
              <button
                key={label}
                onClick={() => setChoice(i)}
                aria-pressed={choice === i}
              >
                {label}
              </button>
            ))}
            <span className="mono">SCHEMATIC</span>
          </div>
        </div>
      </div>
      <div className="stack-card-bottom mono">
        <span>JEV SIGNAL → C4 POLICY → HOST CONTROL</span>
        <span>
          {index < 3 ? "SCROLL TO THE NEXT CROSSING" : "EVERY STEP CONNECTED"}{" "}
          <ArrowDown size={12} />
        </span>
      </div>
    </motion.article>
  );
}
export function BoundaryStack() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 100px", "end end"],
  });
  return (
    <section className="mechanism section-pad" id="how-it-works">
      <SectionLabel number="01">INSIDE THE AGENT LOOP</SectionLabel>
      <div className="section-heading">
        <h2>
          Autonomy needs
          <br />
          <em>a control plane.</em>
        </h2>
        <p>
          Four boundaries. One continuous thread.
          <br />
          Scroll through the crossings.
          <br />
          Change a gate. Watch the signal respond.
        </p>
      </div>
      <nav className="boundary-jumps mono" aria-label="Agent boundaries">
        {boundaries.map((item, i) => (
          <a href={`#boundary-${i}`} key={item.name}>
            <span>0{i + 1}</span>
            {item.name}
            <ArrowDown size={12} />
          </a>
        ))}
      </nav>
      <div className="boundary-stack" ref={ref}>
        {boundaries.map((item, index) => (
          <StackCard key={item.name} index={index} progress={scrollYProgress} />
        ))}
      </div>
    </section>
  );
}
