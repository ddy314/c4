import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reducer } from "./engine.ts";
import { scenarios, selectionFromUrl } from "./scenarios.ts";
import evidence from "../generated/evidence.json" with { type: "json" };

test("each protected action pauses; a read approval does not authorize an upload", () => {
  let state = initialState(scenarios[0].events("c4"));
  state = reducer(state, { type: "play" });
  state = reducer(state, { type: "next" });
  assert.equal(state.status, "awaiting-review");
  assert.equal(reducer(state, { type: "next" }), state);
  state = reducer(state, { type: "review", approved: true });
  assert.equal(state.reviews["demo-read"], "approved");
  state = reducer(state, { type: "next" });
  assert.equal(state.events[state.cursor].action, "allow");
  state = reducer(state, { type: "next" });
  assert.equal(state.status, "awaiting-review");
  assert.equal(state.events[state.cursor].id, "demo-upload");
  assert.equal(state.reviews["demo-upload"], undefined);
  state = reducer(state, { type: "review", approved: false });
  assert.equal(state.status, "completed");
  assert.equal(state.reviews["demo-upload"], "denied");
  assert.equal(reducer(state, { type: "review", approved: true }), state);
});
test("denying the first read prevents subsequent actions", () => {
  const asked = reducer(initialState(scenarios[0].events("c4")), {
    type: "next",
  });
  const denied = reducer(asked, { type: "review", approved: false });
  assert.equal(denied.status, "completed");
  assert.equal(denied.cursor, 0);
  assert.equal(reducer(denied, { type: "next" }).cursor, 0);
});
test("a hard block cannot be approved or advanced past", () => {
  let state = initialState(scenarios[1].events("c4"));
  state = reducer(state, { type: "next" });
  state = reducer(state, { type: "next" });
  assert.equal(state.status, "completed");
  assert.equal(state.events[state.cursor].action, "block");
  assert.equal(reducer(state, { type: "review", approved: true }), state);
  assert.equal(reducer(state, { type: "next" }), state);
});
test("pause and single step remain paused, while reset clears prior reviews and selection", () => {
  let state = reducer(initialState(scenarios[0].events("c4")), {
    type: "next",
  });
  state = reducer(state, { type: "review", approved: true });
  state = reducer(state, { type: "pause" });
  state = reducer(state, { type: "next" });
  assert.equal(state.status, "paused");
  assert.equal(state.cursor, 1);
  assert.deepEqual(
    reducer(state, { type: "reset" }),
    initialState(state.events),
  );
  assert.equal(reducer(state, { type: "select", index: 20 }), state);
});
test("switching scenarios replaces the event stream and resets all transient state", () => {
  let state = reducer(initialState(scenarios[0].events("c4")), {
    type: "next",
  });
  state = reducer(state, { type: "review", approved: true });
  state = reducer(state, {
    type: "load",
    events: scenarios[2].events("projection"),
  });
  assert.equal(state.status, "idle");
  assert.equal(state.cursor, -1);
  assert.deepEqual(state.reviews, {});
  assert.equal(state.events[0].id, "demo-note");
});
test("all scenario arms can complete, preserving the scripted branch boundaries", () => {
  for (const scenario of scenarios)
    for (const mode of scenario.modes)
      for (const variant of ["public", "local"]) {
        let state = initialState(scenario.events(mode, variant));
        for (let step = 0; step < 15 && state.status !== "completed"; step++) {
          state = reducer(
            state,
            state.status === "awaiting-review"
              ? { type: "review", approved: true }
              : { type: "next" },
          );
        }
        assert.equal(
          state.status,
          "completed",
          `${scenario.id}/${mode}/${variant}`,
        );
      }
});
test("share links validate the scenario and restrict mode to the selected scenario", () => {
  assert.deepEqual(selectionFromUrl("?scenario=projection&mode=quarantine"), {
    scenarioId: "projection",
    mode: "quarantine",
  });
  assert.deepEqual(selectionFromUrl("?scenario=egress&mode=native"), {
    scenarioId: "egress",
    mode: "c4",
  });
  assert.deepEqual(selectionFromUrl("?scenario=unknown&mode=oops"), {
    scenarioId: "crossing",
    mode: "c4",
  });
});
test("public episode counts match the summaries and selected projection is actually observed", () => {
  assert.equal(evidence.pi.rows.length, 54);
  for (const group of ["attack", "benign", "hard-benign"] as const)
    for (const arm of ["native", "quarantine", "projection"] as const) {
      const rows = evidence.pi.rows.filter(
        (row) => row.group === group && row.arm === arm,
      );
      assert.equal(rows.length, 6);
      assert.equal(
        rows.filter((row) => row.statusDelivered).length,
        evidence.pi.summary[group][arm].statusDelivered,
      );
      assert.equal(
        rows.filter((row) => row.canaryDelivered).length,
        evidence.pi.summary[group][arm].canaryDelivered,
      );
    }
  const sample = evidence.pi.rows.find(
    (row) => row.id === "a02" && row.arm === "projection",
  )!;
  assert.equal(sample.projectedResults, 1);
  assert.equal(sample.statusDelivered, true);
  assert.deepEqual(evidence.projection.facts, [
    { key: "Release status", value: "yellow" },
  ]);
  assert.deepEqual(evidence.projection.ineligibleFacts, []);
});
