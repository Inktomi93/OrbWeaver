// The conformance net for `conversion-refusal-liveness` (#2017) plus the REAL-CORPUS arm the proof rows
// structurally cannot carry.
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

import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import { gate } from "../../../../tooling/src/verify/gates/conversion-refusal-liveness.ts";
import { CONVERSION_REFUSAL } from "../../../../tooling/src/verify/gates/no-blanket-suppression.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** A verify tree this small means the glob stopped reading, and a zero-denominator green is the exact
 *  clean-zero this policy exists to refuse. */
const MIN_VERIFY_MODULES = 400;

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

test("the policy reads the REAL verify corpus and accuses nothing: the #2106 arm", ({ repoRoot }) => {
  // `analysis: "syntax"`, so the pure-AST project is the faithful substrate and the type graph is not owed.
  const project = getWorkspace({ root: repoRoot, types: false, globs: [`${repoRoot}/tooling/src/verify/**/*.ts`] });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });

  // A tool error or a withheld policy would make the zero below meaningless.
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);

  // THE COUNT THAT WAS WRONG. Two effective findings on `no-blanket-suppression.ts` at `0c5bedfd7` — ARM D
  // mis-accusing on an unreadable `gate`, and ARM E reporting the read failure the concatenated PROSE field
  // caused. Both came from one atomic object read; neither was a defect in the module.
  expect(result.authority.effectiveFindings.map((finding) => `${finding.file}:${finding.line} ${finding.message}`)).toEqual([]);
  // HARD authority: no waiver is available for this policy, so a waived finding or an alarm carrying its id
  // would mean the authority plane changed under it rather than that the corpus is clean. Scoped to THIS
  // policy on purpose — `knownPolicies` holds only this one, so every OTHER policy's live `@orb-waive`
  // markers on the verify tree alarm as "unknown policy" here by construction, and asserting the whole list
  // empty would be asserting something about a corpus this run never loaded.
  expect(result.authority.waivedFindings.filter((waived) => waived.finding.policyId === gate.id)).toEqual([]);
  expect(result.authority.authorityAlarms.filter((alarm) => alarm.policyId === gate.id)).toEqual([]);

  // The denominator, so the green is a MEASUREMENT. The policy emits one population receipt counting every
  // verify module it walked.
  const receipts = result.policies.find(({ id }) => id === gate.id)?.receipts ?? [];
  const population = receipts.find((receipt) => receipt.kind === "population");
  expect(population?.source).toBe("verify-modules");
  expect(population?.kind === "population" ? population.members : 0).toBeGreaterThan(MIN_VERIFY_MODULES);
});
