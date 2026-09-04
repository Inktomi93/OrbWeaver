// THE PROOF CAP'S REMAINDER IS A PUBLISHED FACT, NOT A SILENT TRUNCATION (#1538 item 1).
//
// `proveSelectors` declares in prose that "the remainder is reported UNPROVEN rather than silently counted
// as unique". It was not: the `.slice(0, 64)` dropped the tail and returned only the proofs, so above the
// cap the 65th distinct emitted selector onward read exactly like a clean sweep — the false clean this
// whole proof exists to prevent, one layer up.
//
// WHY A PROBLEM ROW AND NOT A GAP. #1326 ruled that selector locatability belongs to the INSTRUMENT and
// rides as its own row rather than reddening the app's verdict (design-audit-problems.ts's own header).
// A bound this instrument chose for itself is the same class of fact, so the remainder is published on
// the SELECTOR line, in `selectors-unproven`, and here — never as a run-level NO VERDICT about the app.
import type { Finding } from "@orb/tooling/ui-audit";
import { designAuditProblems } from "../../../../tooling/src/snap/lib/design-audit-problems.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FINDING: Finding = {
  rule: "tap-target",
  severity: "P2",
  selector: '[aria-label="Tiny"]',
  value: "16x16",
  message: "the control is below the target-size floor",
  origin: "impeccable",
};

const PROVEN = [{ selector: '[aria-label="Tiny"]', matches: 1 }] as const;

function problems(selectorsUnproven: number): readonly ReturnType<typeof designAuditProblems>[number][] {
  return designAuditProblems({ findings: [FINDING], gaps: [], failOn: "P1", selectorProof: PROVEN, selectorsUnproven });
}

test("a truncated selector proof publishes its remainder as a problem row naming the cap", () => {
  const row = problems(7).find((problem) => problem.subject === "selector-proof-cap");

  expect(row).toMatchObject({
    arm: "design-audit",
    kind: "failure",
    metric: "finding-selector-uniqueness",
    observed: "7 unproven",
    threshold: "1 proven",
  });
  expect(row?.detail).toContain("never quietly unique");
});

test("a complete selector proof publishes NO cap row — the remainder is a fact, not a permanent warning", () => {
  // The negative control: without it the assertion above would pass on a row emitted unconditionally.
  expect(problems(0).some((problem) => problem.subject === "selector-proof-cap")).toBe(false);
  // …and the ordinary finding row is still there, so the filter above is not simply finding nothing.
  expect(problems(0).some((problem) => problem.metric === "tap-target")).toBe(true);
});
