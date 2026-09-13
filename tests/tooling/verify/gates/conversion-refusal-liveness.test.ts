// The conformance net for `conversion-refusal-liveness` (#2017). The REAL-CORPUS arm is its `.repo.int`
// sibling — it builds a project over the whole verify tree and belongs in the integration project, not
// in this fast one, where it blew the 6.2s unit timeout and became a load-shaped flake.
//
// THE REAL-CORPUS ARM EXISTS BECAUSE ITS ABSENCE SHIPPED A RED GATE (#2106). This suite originally reasoned
// that running the policy over the tree was "`check:structure`'s job, not a unit suite's" and asserted only
// the declaration's SHAPE. Both halves were green while the policy reported TWO effective findings against
// `no-blanket-suppression.ts` on main, on a HARD policy — a fixture-green that could not see a real-tree
// red. `policy-soundness-family.repo.int.test.ts` had already written the rule down: *"Conformance runs on
// virtual projects with no real layout; a meta-policy over the gate corpus can be green there and blind
// here."* A meta-policy over the corpus owes a run over the corpus, and this is it.
//
// The SHAPE assertions stay beside it: they name WHICH property of the live declaration each arm depends
// on, so a failure says what broke rather than only that something did. If the declaring module converts,
// the import stops resolving and the suite says so loudly — the correct failure for a refusal whose subject
// converted.

import { GATE_RESOURCE_REQUEST_KINDS } from "../../../../tooling/src/verify/contract/resource-declaration.ts";
import { gate } from "../../../../tooling/src/verify/gates/conversion-refusal-liveness.ts";
import { CONVERSION_REFUSAL } from "../../../../tooling/src/verify/gates/no-blanket-suppression.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("every arm of the refusal-liveness policy proves itself through the production runtime", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the one live conversion refusal names its own module and holds BOTH halves of guide §4", () => {
  expect(CONVERSION_REFUSAL.gate).toBe("no-blanket-suppression");
  // BOTH conjuncts, which is the #2116 repair: the reopen bar (two or more independent consumers) AND the
  // capability claim (#2013 — the kind this refusal rests on not existing). Holding only the first is what
  // let a refusal outlive the very door it specified.
  expect(CONVERSION_REFUSAL.blockers.map((blocker) => blocker.kind).toSorted((a, b) => a.localeCompare(b))).toEqual(["missing-kind", "sole-consumer"]);

  // Partitioned rather than branched inside the assertions: a conditional `expect` passes vacuously when
  // the branch is never taken, which is the same shape as the clean zero this policy is about.
  const censusBlockers = CONVERSION_REFUSAL.blockers.filter((blocker) => blocker.kind === "sole-consumer");
  // The population is `tooling/src/verify/**`; a blocker scoped outside it censuses nothing and passes
  // forever, which is ARM E's whole subject.
  expect(censusBlockers.map((blocker) => blocker.under.startsWith("tooling/src/verify/"))).toEqual([true]);
  // The SPELLING itself, not a length: `as const` already makes the tuple non-empty to tsc, so a length
  // assertion is statically true and proves nothing. `--cached` is the discriminator for talking to the
  // git INDEX, which is the capability the whole refusal turns on.
  expect(censusBlockers.flatMap((blocker) => [...blocker.spellings])).toContain("--cached");
  expect(censusBlockers.flatMap((blocker) => [...blocker.consumers])).toContain("tooling/src/verify/gates/no-blanket-suppression.ts");

  // The claim IS that the name is absent, so asserting it present would invert the row. ARM F is what reds
  // when it stops being absent.
  const capabilityBlockers = CONVERSION_REFUSAL.blockers.filter((blocker) => blocker.kind === "missing-kind");
  const frozen: readonly string[] = GATE_RESOURCE_REQUEST_KINDS;
  expect(capabilityBlockers.map((blocker) => frozen.includes(blocker.wouldBeKind))).toEqual([false]);
});

test("the refusal names what it does NOT hold, so its existence is not read as full coverage", () => {
  expect(CONVERSION_REFUSAL.unheld.length).toBeGreaterThan(0);
});
