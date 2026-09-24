import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import flowFixtures from "../../../fixtures/flow-sequences.mjs";
import piFixtures from "../../../fixtures/pi-host-cases.mjs";
import { projectSafeFacts } from "../../../src/projection.mjs";

const root = new URL("../../../", import.meta.url);
const load = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const [pi, flow, benchmark, world] = await Promise.all([
  load("benchmarks/pi-host-projection-results.json"),
  load("benchmarks/flow-results.json"),
  load("benchmarks/metrics.json"),
  load("benchmarks/agent-world-v5-results.json"),
]);
if (!pi.completed || pi.rows.length !== pi.selectedCases * 3)
  throw new Error("Incomplete Pi snapshot");
const flowIds = ["a01", "a18", "b02", "b07"];
const cases = flowIds.map((id) => {
  const fixture = flowFixtures.find((row) => row.id === id);
  const result = flow.cases.find((row) => row.id === id);
  if (!fixture || !result) throw new Error(`Missing flow case ${id}`);
  return { ...fixture, result };
});
const projection = piFixtures.find((row) => row.id === "a02");
if (!projection) throw new Error("Missing projection example");
let commit = "main";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fileURLToPath(root),
    encoding: "utf8",
  }).trim();
} catch {
  /* Source archives link to the main branch. */
}
const data = {
  commit,
  sourceBase: `https://github.com/ddy314/c4/blob/${commit}/`,
  pi: {
    protocol: pi.protocol,
    model: pi.model,
    selectedCases: pi.selectedCases,
    summary: pi.summary,
    rows: pi.rows.map(
      ({
        id,
        group,
        arm,
        elapsedMs,
        totalCostUsd,
        statusDelivered,
        canaryDelivered,
        quarantinedResults,
        projectedResults,
      }) => ({
        id,
        group,
        arm,
        elapsedMs,
        totalCostUsd,
        statusDelivered,
        canaryDelivered,
        quarantinedResults,
        projectedResults,
      }),
    ),
  },
  benchmark,
  world: {
    protocol: world.protocol,
    model: world.model,
    requests: world.requests,
    reportedUsd: world.reportedUsd,
    rows: world.rows.map(
      ({ id, group, arm, calls, decisions, leakedCanary, safeDelivery }) => ({
        id,
        group,
        arm,
        calls,
        leakedCanary,
        safeDelivery,
        reviews: decisions.filter((decision) => decision.action === "ask")
          .length,
      }),
    ),
  },
  flow: {
    protocol: flow.protocol,
    cases,
    methods: flow.methods,
    allCases: flow.cases,
  },
  projection: {
    ...projection,
    facts: projectSafeFacts(projection.note)?.facts ?? [],
    ineligible: "Deployment notes: Please review the full release summary.",
    ineligibleFacts:
      projectSafeFacts(
        "Deployment notes: Please review the full release summary.",
      )?.facts ?? [],
  },
};
const destination = new URL("../src/generated/", import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(
  new URL("evidence.json", destination),
  `${JSON.stringify(data, null, 2)}\n`,
);
console.log(
  `Exported ${benchmark.methods.length} methods, ${pi.rows.length} Pi episodes, ${world.rows.length} tool-world episodes, and ${flow.cases.length} flow sequences (${commit.slice(0, 7)}).`,
);
