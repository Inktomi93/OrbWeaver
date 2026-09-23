import type { CasePlan, ProbeStep } from "@orb/tooling/cache-check";
import { CACHE_CASES, CASE_PLANS } from "@orb/tooling/cache-check";
import { expect, test } from "../../../support/tool-fixtures.ts";

// How many judged calls a step contributes, read the same way ops/drive.ts reads a step's replies.
function measuredCalls(step: ProbeStep): number {
  if (step.kind === "note" || step.measure === "none") {
    return 0;
  }
  const replies = step.kind === "send" ? (step.speakers ?? 1) : 1;
  return step.measure === "last" ? 1 : replies;
}

const judged = (plan: CasePlan): number => plan.steps.reduce((sum, step) => sum + measuredCalls(step), 0);

test.each(CACHE_CASES)("the %s plan puts at least two calls in its judged sequence", (name) => {
  expect(judged(CASE_PLANS[name])).toBeGreaterThanOrEqual(2);
});

test("the group plan's judged sequence opens on the long round and crosses two round boundaries", () => {
  const [longRound, ...rounds] = CASE_PLANS.group.steps;
  expect(longRound).toMatchObject({ kind: "send", measure: "last" });
  expect(rounds).toHaveLength(2);
  expect(rounds.every((step) => step.kind === "send" && step.measure === "all" && step.speakers === 2)).toBe(true);
});

test("the deep-note plan sets its note before any judged turn", () => {
  const steps = CASE_PLANS["deep-note"].steps;
  const note = steps.findIndex((step) => step.kind === "note");
  const firstJudged = steps.findIndex((step) => measuredCalls(step) > 0);
  expect(note).toBeGreaterThan(-1);
  expect(note).toBeLessThan(firstJudged);
});
