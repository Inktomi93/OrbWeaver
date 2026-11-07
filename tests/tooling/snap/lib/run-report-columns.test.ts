// A run-over-run regression is a claim about two MEASURED counters. A counter an older run never printed is
// not a zero, so it can never be the "before" of a regression.
import { expect, test } from "@orb/testkit/tooling";
import { runRegressions } from "../../../../tooling/src/snap/lib/run-report-columns.ts";

function pairs(...rows: readonly (readonly [string, string])[]): { readonly resultPairs: readonly (readonly [string, string])[] } {
  return { resultPairs: rows };
}

test("a counter the previous run never printed is not a regression from zero", () => {
  expect(runRegressions(pairs(["page-errors", "3"]), pairs())).toEqual([]);
});

test("a counter the current run never printed is not compared", () => {
  expect(runRegressions(pairs(), pairs(["page-errors", "3"]))).toEqual([]);
});

test("a blank or non-numeric counter is absent, not zero", () => {
  expect(runRegressions(pairs(["page-errors", "3"]), pairs(["page-errors", ""]))).toEqual([]);
  expect(runRegressions(pairs(["page-errors", "3"]), pairs(["page-errors", "n/a"]))).toEqual([]);
});

test("an explicit zero that became a positive count is a regression", () => {
  expect(runRegressions(pairs(["page-errors", "1"]), pairs(["page-errors", "0"]))).toEqual([
    { counter: "page-errors", label: "page errors", before: 0, after: 1 },
  ]);
});

test("an unchanged or decreasing counter is not a regression", () => {
  expect(runRegressions(pairs(["page-errors", "2"]), pairs(["page-errors", "2"]))).toEqual([]);
  expect(runRegressions(pairs(["page-errors", "1"]), pairs(["page-errors", "2"]))).toEqual([]);
});
