// The design-audit RESULT line's two derived NO-VERDICT values (#1345). A `population-verdict=NO-VERDICT`
// that does not say WHICH rules were withheld and WHY cost a 2026-09-04 review three extra calls and a
// python heredoc over the report JSON to learn that the answer was "box is off-screen".
import type { PopulationAccounting, RulePopulationAccounting } from "@orb/tooling/ui-audit";
import { backdropRefusalSummary, populationWithheldSummary } from "../../../../tooling/src/ui-audit/ops/report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function row(overrides: Partial<RulePopulationAccounting> = {}): RulePopulationAccounting {
  return { candidates: 0, judged: 0, affected: 0, populations: 0, emitted: 0, withheld: {}, excluded: {}, collapsed: {}, ...overrides };
}

test("the withheld summary names every rule and reason, and stays one whitespace-free token", () => {
  const accounting: PopulationAccounting = {
    contrast: row({ candidates: 30, withheld: { unresolvedBackdrop: 30 } }),
    "text-over-art": row({ candidates: 12, withheld: { unresolvedBackdrop: 12 } }),
    // Judged cleanly: never named, or the value would read as a defect list.
    "tap-target": row({ candidates: 4, judged: 4 }),
  };

  const summary = populationWithheldSummary(accounting);

  expect(summary).toBe("contrast:unresolvedBackdrop×30+text-over-art:unresolvedBackdrop×12");
  expect(summary).not.toMatch(/\s/u);
});

test("presentation-only withholding is not a completeness gap and never enters the value", () => {
  // `representativeCap` is the display cap, and `lib/population.ts` already excludes it from the verdict.
  // Naming it here would make every capped-but-complete run look partial.
  const accounting: PopulationAccounting = {
    "tap-target": row({ candidates: 9, judged: 9, affected: 9, populations: 1, emitted: 1, collapsed: { sameOwner: 8 } }),
  };

  expect(populationWithheldSummary(accounting)).toBe("none");
});

test("the refusal summary counts the DISTINCT reason strings, not the nodes", () => {
  const summary = backdropRefusalSummary([
    { selector: "#a", reason: "box is off-screen" },
    { selector: "#b", reason: "box is off-screen" },
    { selector: "#c", reason: "no painted ancestor" },
  ]);

  expect(summary).toBe("box-is-off-screen×2+no-painted-ancestor×1");
  expect(backdropRefusalSummary([])).toBe("none");
});
