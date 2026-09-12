// THE REAL-CORPUS ARM for `conversion-refusal-liveness`, and it lives here rather than beside the
// conformance net for two reasons that are both the point (#2106, #2075).
//
// WHY IT EXISTS: its ABSENCE shipped a red gate. The conformance suite reasoned that running the policy
// over the tree was "`check:structure`'s job, not a unit suite's" and asserted only the declaration's
// SHAPE. Both halves were green while the policy reported TWO effective findings against
// `no-blanket-suppression.ts` on main, on a HARD policy. `policy-soundness-family.repo.int.test.ts` had
// already written the rule down: *"Conformance runs on virtual projects with no real layout; a meta-policy
// over the gate corpus can be green there and blind here."* A meta-policy over the corpus owes a run over
// the corpus.
//
// WHY IT IS `.repo.int` AND NOT THE UNIT FILE: it builds a ts-morph project over the whole verify tree and
// takes seconds. Landed in the fast `tooling` project it blew the 6.2s unit timeout on its second run and
// became a load-shaped flake — a real-corpus arm belongs in the integration project beside its siblings
// (`no-blanket-suppression.repo.int.test.ts`, `policy-soundness-family.repo.int.test.ts`), which is where
// every other gate that reads the real tree keeps one.
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import { gate } from "../../../../tooling/src/verify/gates/conversion-refusal-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** A verify tree this small means the glob stopped reading, and a zero-denominator green is the exact
 *  clean-zero this policy exists to refuse. */
const MIN_VERIFY_MODULES = 400;

test("the policy reads the REAL verify corpus and accuses nothing", ({ repoRoot }) => {
  // `analysis: "syntax"`, so the pure-AST project is the faithful substrate and the type graph is not owed.
  const project = getWorkspace({ root: repoRoot, types: false, globs: [`${repoRoot}/tooling/src/verify/**/*.ts`] });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: repoRoot, project, reviewedGrants: [], failOnWarnings: false });

  // A tool error or a withheld policy would make the zero below meaningless.
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);

  // THE COUNT THAT WAS WRONG. Two effective findings on `no-blanket-suppression.ts` at `0c5bedfd7` — ARM D
  // mis-accusing on an unreadable `gate`, and ARM E reporting the read failure a concatenated PROSE field
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
