import type { CacheCase, CasePlan, ProbeStep } from "@orb/tooling/cache-check";
import { CACHE_CASES, CASE_PLANS, ROOM_KINDS, ROOMS, roomRuns } from "@orb/tooling/cache-check";
import { expect, test } from "../../../support/fixtures.ts";

// How many judged calls a step contributes, read the same way ops/drive.ts reads a step's replies.
function measuredCalls(step: ProbeStep): number {
  if (step.kind !== "send" && step.kind !== "continue" && step.kind !== "generate") {
    return 0;
  }
  if (step.measure === "none") {
    return 0;
  }
  const replies = step.kind === "send" ? (step.speakers ?? 1) : 1;
  return step.measure === "last" ? 1 : replies;
}

const judged = (plan: CasePlan): number => plan.steps.reduce((sum, step) => sum + measuredCalls(step), 0);

test.each(CACHE_CASES)("the %s plan puts at least two calls in its judged sequence", (name) => {
  expect(judged(CASE_PLANS[name])).toBeGreaterThanOrEqual(2);
});

test("every room writes its prefix with a committed line and a generate; only the per-speaker opening is judged", () => {
  for (const room of ROOM_KINDS) {
    expect(ROOMS[room].prefixSteps.map((step) => step.kind)).toEqual(["commit", "generate"]);
  }
  const judgedOpenings = ROOM_KINDS.filter((room) => ROOMS[room].prefixSteps.some((step) => measuredCalls(step) > 0));
  expect(judgedOpenings).toEqual(["per-speaker"]);
});

test("the selected cases run once each, grouped one chat per room, with the deep note last in its room", () => {
  const runs = roomRuns(CACHE_CASES);
  const ran: CacheCase[] = runs.flatMap((r) => [...r.cases]);
  expect([...ran].sort()).toEqual([...CACHE_CASES].sort());
  expect(runs.map((r) => r.room)).toEqual(["solo", "per-speaker", "narrator"]);
  const solo = runs.find((r) => r.room === "solo")?.cases ?? [];
  expect(solo.at(-1)).toBe("deep-note");
  expect(roomRuns(["deep-note", "solo"])).toEqual([{ room: "solo", cases: ["solo", "deep-note"] }]);
  expect(roomRuns(["narrator"])).toEqual([{ room: "narrator", cases: ["narrator"] }]);
});

test("the group plan judges two rounds after the judged opening, so two judged pairs cross a round boundary", () => {
  const steps = CASE_PLANS.group.steps;
  expect(steps).toHaveLength(2);
  expect(steps.every((step) => step.kind === "send" && step.measure === "all" && step.speakers === 2)).toBe(true);
});

test("the deep-note plan sets its note before any judged turn", () => {
  const steps = CASE_PLANS["deep-note"].steps;
  const note = steps.findIndex((step) => step.kind === "note");
  const firstJudged = steps.findIndex((step) => measuredCalls(step) > 0);
  expect(note).toBeGreaterThan(-1);
  expect(note).toBeLessThan(firstJudged);
});
