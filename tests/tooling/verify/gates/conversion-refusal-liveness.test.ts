// The conformance net for `conversion-refusal-liveness` (#2017) plus the REAL-TREE arm the proof rows
// structurally cannot carry: a `mode: "source"` fixture writes its own virtual project, so no proof row can
// say anything about the module that actually declares a refusal today.
//
// The real-tree arm is deliberately a SHAPE assertion on the declaration rather than a run of the policy
// over the whole verify tree (which is `check:structure`'s job, not a unit suite's): it pins that the one
// live `CONVERSION_REFUSAL` names its own module, is scoped inside the policy's population, and declares at
// least one spelling — the three things that make its census a measurement. If the module converts, this
// import stops resolving and the suite says so loudly, which is the correct failure for a refusal whose
// subject converted.

import { gate } from "../../../../tooling/src/verify/gates/conversion-refusal-liveness.ts";
import { CONVERSION_REFUSAL } from "../../../../tooling/src/verify/gates/no-blanket-suppression.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("every arm of the refusal-liveness policy proves itself through the production runtime", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the one live conversion refusal names its own module and censuses inside the policy's population", () => {
  expect(CONVERSION_REFUSAL.gate).toBe("no-blanket-suppression");
  expect(CONVERSION_REFUSAL.blockers.length).toBeGreaterThan(0);
  for (const blocker of CONVERSION_REFUSAL.blockers) {
    expect(blocker.kind).toBe("sole-consumer");
    // The population is `tooling/src/verify/**`; a blocker scoped outside it censuses nothing and passes
    // forever, which is ARM E's whole subject.
    expect(blocker.under.startsWith("tooling/src/verify/")).toBe(true);
    expect(blocker.spellings.length).toBeGreaterThan(0);
    expect(blocker.consumers).toContain("tooling/src/verify/gates/no-blanket-suppression.ts");
  }
});

test("the refusal names what it does NOT hold, so its existence is not read as full coverage", () => {
  expect(CONVERSION_REFUSAL.unheld.length).toBeGreaterThan(0);
});
