import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowUpRight } from "lucide-react";
import evidence from "../generated/evidence.json";
import { SectionLabel, SourceLink } from "./Primitives";

const methods = evidence.benchmark.methods;
type Method = (typeof methods)[number];
type View = "cost" | "latency" | "detection" | "categories";
const names: Record<string, string> = {
  c4: "C4 · Jev + candidate",
  "action-rule": "Keyword rules",
  "google/gemma-3-4b-it": "Gemma 3 4B",
  "meta-llama/llama-3.2-3b-instruct": "Llama 3.2 3B",
  "mistralai/ministral-3b-2512": "Ministral 3B",
  "qwen/qwen3-30b-a3b-instruct-2507": "Qwen3 30B A3B",
  "openai/gpt-4o-mini": "GPT-4o-mini",
  "google/gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "deepseek/deepseek-v3.2": "DeepSeek V3.2",
  "deepseek/deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
  "google/gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
  "openai/gpt-6-luna": "GPT-6 Luna",
  "qwen/qwen3.8-flash": "Qwen3.8 Flash",
  "qwen/qwen3.8-27b": "Qwen3.8 27B",
};
const color = (m: Method) =>
  m.id === "c4" ? "#294b65" : m.family === "2026 model" ? "#6b90ae" : "#a0acb6";
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const views: [View, string][] = [
  ["cost", "Accuracy × cost"],
  ["latency", "Accuracy × latency"],
  ["detection", "Attack detection"],
  ["categories", "By category"],
];
const categories = Object.keys(
  methods[0].category,
) as (keyof Method["category"])[];
const categoryLabels = [
  "Physical harm",
  "Financial harm",
  "Data security",
  "Physical data",
  "Financial data",
  "Others",
];

export function BenchmarkExplorer() {
  const [view, setView] = useState<View>("cost");
  const [cohort, setCohort] = useState("all");
  const [selected, setSelected] = useState("c4");
  const [hovered, setHovered] = useState<string | null>(null);
  const scatter = view === "cost" || view === "latency";
  const visible = methods.filter(
    (m) =>
      (!scatter || m.id !== "action-rule") &&
      (cohort === "all" || m.family === cohort || m.id === "c4"),
  );
  const activeId =
    hovered ?? (visible.some((m) => m.id === selected) ? selected : "c4");
  const active = methods.find((m) => m.id === activeId)!;
  const chooseView = (value: string) => {
    setView(value as View);
    setHovered(null);
  };
  const inspect = (id: string) => {
    setSelected(id);
    setHovered(null);
  };
  const cost = view === "cost";
  const x = (m: Method) =>
    cost
      ? 65 + ((Math.log10(m.cost_per_1000_valid) - Math.log10(0.008)) / 2) * 590
      : 65 + (((m.median_latency_ms ?? 0) - 250) / 3350) * 590;
  const y = (m: Method) => 350 - ((m.balanced_accuracy - 0.46) / 0.59) * 300;
  return (
    <section id="evidence" className="benchmark-section section-pad">
      <SectionLabel number="03">THE MEASURED TRADE-OFFS</SectionLabel>
      <div className="section-heading">
        <h2>
          Inspect the evidence.
          <br />
          <em>Change the lens.</em>
        </h2>
        <p>
          Thirteen chat models, C4, and local rules.
          <br />
          One pinned classification cohort.
          <br />
          Quality, cost, latency—and the false alarms.
        </p>
      </div>
      <div className="benchmark-facts">
        {[
          ["15", "METHODS"],
          ["60", "INJECTION ATTACKS"],
          ["60", "PAIRED EASY CONTROLS"],
          ["12", "SEPARATE HARD BENIGN"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span className="mono">{label}</span>
          </div>
        ))}
      </div>
      <div className="benchmark-explorer">
        <Tabs.Root value={view} onValueChange={chooseView}>
          <div className="benchmark-toolbar">
            <Tabs.List aria-label="Benchmark chart">
              {views.map(([id, title]) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  id={`chart-tab-${id}`}
                  aria-controls="benchmark-chart"
                >
                  {title}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <label className="cohort-filter">
              Cohort
              <select
                aria-label="Model cohort"
                value={cohort}
                onChange={(e) => {
                  setCohort(e.target.value);
                  setHovered(null);
                }}
              >
                <option value="all">All methods</option>
                <option value="2026 model">2026 models + C4</option>
                <option value="Earlier baseline">Earlier models + C4</option>
              </select>
            </label>
          </div>
        </Tabs.Root>
        <div className="benchmark-layout">
          <div
            className="benchmark-main"
            id="benchmark-chart"
            role="tabpanel"
            aria-labelledby={`chart-tab-${view}`}
          >
            <div className="chart-heading">
              <div>
                <h3>
                  {scatter
                    ? `Balanced accuracy vs. ${cost ? "reported API cost" : "API latency"}`
                    : view === "detection"
                      ? "Attacks caught, by method"
                      : "Attack detection across six categories"}
                </h3>
                <p>
                  {scatter
                    ? "Higher and farther left is better. Select a point to inspect it."
                    : view === "detection"
                      ? "60 attacks per method. False alarms are shown separately in the inspector."
                      : "Each cell shows attacks caught / 10. Select a row to inspect the method."}
                </p>
              </div>
              <span className="mono">
                {String(visible.length).padStart(2, "0")} METHODS
              </span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="chart-stage"
                key={view}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.23 }}
              >
                {scatter ? (
                  <div
                    className="scatter-scroll"
                    tabIndex={0}
                    aria-label="Scatterplot; scroll horizontally to see the full plot on narrow screens"
                  >
                    <div className="chart-scroll-hint mono">
                      SCROLL HORIZONTALLY TO EXPLORE →
                    </div>
                    <svg
                      viewBox="0 0 720 425"
                      className="scatter-chart"
                      role="group"
                      aria-label={`${cost ? "Cost" : "Latency"} and balanced accuracy of ${visible.length} methods`}
                    >
                      <text x="65" y="22" className="axis-title">
                        BALANCED ACCURACY · Y AXIS 46–105%
                      </text>
                      {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((tick) => (
                        <g key={tick}>
                          <line
                            x1="65"
                            x2="655"
                            y1={350 - ((tick - 0.46) / 0.59) * 300}
                            y2={350 - ((tick - 0.46) / 0.59) * 300}
                            className="chart-grid"
                          />
                          <text
                            x="50"
                            y={354 - ((tick - 0.46) / 0.59) * 300}
                            textAnchor="end"
                            className="axis-tick"
                          >
                            {tick * 100}%
                          </text>
                        </g>
                      ))}
                      {(cost
                        ? [0.01, 0.02, 0.05, 0.1, 0.2, 0.5]
                        : [500, 1000, 1500, 2000, 2500, 3000, 3500]
                      ).map((tick) => {
                        const position = cost
                          ? 65 +
                            ((Math.log10(tick) - Math.log10(0.008)) / 2) * 590
                          : 65 + ((tick - 250) / 3350) * 590;
                        return (
                          <g key={tick}>
                            <line
                              x1={position}
                              x2={position}
                              y1="50"
                              y2="350"
                              className="chart-grid vertical"
                            />
                            <text
                              x={position}
                              y="375"
                              textAnchor="middle"
                              className="axis-tick"
                            >
                              {cost ? `$${tick.toFixed(2)}` : `${tick / 1000}s`}
                            </text>
                          </g>
                        );
                      })}
                      <path d="M65 50V350H655" fill="none" stroke="#aebcc7" />
                      <text
                        x="360"
                        y="409"
                        textAnchor="middle"
                        className="axis-title"
                      >
                        {cost
                          ? "REPORTED USD / 1,000 VALID CHECKS · LOG SCALE"
                          : "MEDIAN SUCCESSFUL API-CALL LATENCY · SECONDS"}
                      </text>
                      {visible.map((m) => {
                        const isActive = activeId === m.id;
                        const n = methods.indexOf(m) + 1;
                        return (
                          <g
                            key={m.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`${names[m.id]}: ${percent(m.balanced_accuracy)} accuracy, ${cost ? `$${m.cost_per_1000_valid.toFixed(4)} per 1,000 checks` : `${m.median_latency_ms} milliseconds`}`}
                            aria-pressed={selected === m.id}
                            onMouseEnter={() => setHovered(m.id)}
                            onMouseLeave={() => setHovered(null)}
                            onFocus={() => setHovered(m.id)}
                            onBlur={() => setHovered(null)}
                            onClick={() => inspect(m.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                inspect(m.id);
                              }
                            }}
                            className="scatter-point"
                          >
                            {isActive && (
                              <>
                                <line
                                  x1={x(m)}
                                  x2={x(m)}
                                  y1={y(m)}
                                  y2="350"
                                  stroke={color(m)}
                                  strokeDasharray="3 5"
                                  opacity=".6"
                                />
                                <circle
                                  cx={x(m)}
                                  cy={y(m)}
                                  r="17"
                                  stroke={color(m)}
                                  fill="none"
                                  opacity=".3"
                                />
                              </>
                            )}
                            <circle
                              cx={x(m)}
                              cy={y(m)}
                              r="15"
                              fill="transparent"
                            />
                            <motion.circle
                              cx={x(m)}
                              cy={y(m)}
                              animate={{ r: isActive ? 7 : 5 }}
                              fill={
                                m.family === "Earlier baseline"
                                  ? "#f3f5f7"
                                  : color(m)
                              }
                              stroke={color(m)}
                              strokeWidth="2"
                            />
                            <text
                              x={x(m) + (m.id === "c4" ? -12 : 9)}
                              y={y(m) + (m.id === "c4" ? -12 : 17)}
                              textAnchor={m.id === "c4" ? "end" : "start"}
                              className="point-index"
                            >
                              {m.id === "c4"
                                ? "C4"
                                : String(n).padStart(2, "0")}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                ) : view === "detection" ? (
                  <div className="detection-chart">
                    <div className="bar-axis mono">
                      <span>METHOD</span>
                      <span className="bar-axis-scale">
                        <span>0</span>
                        <span>30</span>
                        <span>60</span>
                      </span>
                      <span>CAUGHT</span>
                    </div>
                    {[...visible]
                      .sort((a, b) => b.caught - a.caught)
                      .map((m) => (
                        <button
                          className={`detection-row ${activeId === m.id ? "active" : ""}`}
                          key={m.id}
                          aria-pressed={selected === m.id}
                          onClick={() => inspect(m.id)}
                        >
                          <span>{names[m.id]}</span>
                          <span className="bar-track">
                            <motion.i
                              initial={{ width: 0 }}
                              animate={{ width: `${(m.caught / 60) * 100}%` }}
                              transition={{ duration: 0.55 }}
                              style={{ backgroundColor: color(m) }}
                            />
                          </span>
                          <strong className="mono">
                            {m.caught}
                            <small>/60</small>
                          </strong>
                        </button>
                      ))}
                  </div>
                ) : (
                  <div
                    className="heatmap-scroll"
                    tabIndex={0}
                    aria-label="Category matrix; scroll horizontally on narrow screens"
                  >
                    <div className="chart-scroll-hint mono">
                      SCROLL HORIZONTALLY TO EXPLORE →
                    </div>
                    <div className="category-matrix">
                      <div className="category-header">
                        <span>METHOD</span>
                        {categoryLabels.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                      {visible.map((m) => (
                        <button
                          className={`category-row ${activeId === m.id ? "active" : ""}`}
                          key={m.id}
                          aria-label={`${names[m.id]}: ${categories.map((cat) => `${cat} ${m.category[cat][0]}/${m.category[cat][1]}`).join(", ")}`}
                          aria-pressed={selected === m.id}
                          onClick={() => inspect(m.id)}
                        >
                          <span>{names[m.id]}</span>
                          {categories.map((cat) => (
                            <span
                              key={cat}
                              style={{
                                backgroundColor: `rgba(63,101,133,${0.05 + (m.category[cat][0] / m.category[cat][1]) * 0.78})`,
                                color:
                                  m.category[cat][0] / m.category[cat][1] >= 0.6
                                    ? "#fff"
                                    : "#253c50",
                              }}
                            >
                              {m.category[cat][0]}
                              <small>/{m.category[cat][1]}</small>
                            </span>
                          ))}
                        </button>
                      ))}
                    </div>
                    <div className="heatmap-legend mono">
                      <span>FEWER DETECTED</span>
                      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                        <i
                          key={v}
                          style={{
                            background: `rgba(63,101,133,${0.05 + v * 0.78})`,
                          }}
                        />
                      ))}
                      <span>MORE DETECTED</span>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            <div className="chart-key">
              {visible.map((m) => (
                <button
                  key={m.id}
                  onClick={() => inspect(m.id)}
                  aria-pressed={activeId === m.id}
                >
                  <i
                    style={{
                      background:
                        m.family === "Earlier baseline"
                          ? "transparent"
                          : color(m),
                      borderColor: color(m),
                    }}
                  />
                  <span className="mono">
                    {String(methods.indexOf(m) + 1).padStart(2, "0")}
                  </span>
                  {names[m.id]}
                </button>
              ))}
            </div>
          </div>
          <aside
            className="model-inspector"
            aria-label="Selected method details"
          >
            <div className="mono tiny">
              INSPECT / {String(methods.indexOf(active) + 1).padStart(2, "0")}
            </div>
            <h3>{names[active.id]}</h3>
            <span className="cohort-badge">
              {active.family === "C4"
                ? "EXPERIMENTAL CANDIDATE"
                : active.family.toUpperCase()}
            </span>
            <dl>
              <div>
                <dt>Balanced accuracy</dt>
                <dd>{percent(active.balanced_accuracy)}</dd>
              </div>
              <div>
                <dt>Attacks caught</dt>
                <dd>
                  {active.caught}
                  <small> / 60</small>
                </dd>
              </div>
              <div>
                <dt>Easy controls allowed</dt>
                <dd>
                  {active.allowed}
                  <small> / 60</small>
                </dd>
              </div>
              <div className="false-alarm">
                <dt>Hard-benign false alarms</dt>
                <dd>
                  {active.hard_false_alarms}
                  <small> / {active.hard_valid} valid</small>
                </dd>
              </div>
              <div>
                <dt>Reported cost / 1,000 checks</dt>
                <dd>${active.cost_per_1000_valid.toFixed(4)}</dd>
              </div>
              <div>
                <dt>Median API latency</dt>
                <dd>
                  {active.median_latency_ms === null
                    ? "No API call"
                    : `${active.median_latency_ms} ms`}
                </dd>
              </div>
            </dl>
            <p>
              {active.id === "c4"
                ? "Candidate policy measured here. The shipped default remains balanced. One hard-benign case had no valid result."
                : "Recorded classification outcomes for this protocol; not a production safety estimate."}
            </p>
            <SourceLink path="benchmarks/metrics.json">
              Inspect source data
            </SourceLink>
          </aside>
        </div>
        <div className="chart-footnote">
          <span className="mono">READ THE AXES</span>
          <p>
            {scatter
              ? "Local rules make no API call and appear in the detection and category views. "
              : "Hard-benign false alarms are separate from the 60 paired easy controls. "}
            Balanced accuracy averages attack recall and easy-control
            specificity; it excludes hard-benign false alarms. Cost includes
            retries; latency is the median successful call. Earlier and newer
            runs used different output-token/reasoning settings.
          </p>
        </div>
      </div>
      <details className="benchmark-methodology">
        <summary>
          Protocol, provenance, and limitations <ArrowUpRight size={15} />
        </summary>
        <div>
          <p>
            Pinned InjecAgent cohort: 60 attacks (10 per category), 60
            template-derived easy controls, and 12 separately authored
            hard-benign cases. The chart uses recorded results, not a live
            benchmark. Differences are observations of these protocols, not
            intrinsic model rankings.
          </p>
          <p>
            Qwen3.8 Flash caught 59/60 attacks with 0/12 hard-benign false
            alarms. C4 caught 58/60 with 6/11. No confidence intervals were
            estimated. The experimental C4 candidate threshold was selected on
            an earlier development split.
          </p>
          <SourceLink path="benchmarks/results.json">
            Run settings and results
          </SourceLink>
          <SourceLink path="scripts/render-benchmark-charts.py">
            Original chart definitions
          </SourceLink>
        </div>
      </details>
    </section>
  );
}
