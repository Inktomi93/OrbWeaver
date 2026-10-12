// The CT config mirrors are hand-authored test composition roots. This pin drives their parity policy
// through the production proof dispatcher and separately proves filesystem discovery sees the policy. Its
// real-corpus liveness arm is DATA in `_liveness/tests.ts`, run by the one liveness runner.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { getWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { gate } from "../../../../tooling/src/verify/gates/ct-config-mirror-parity.ts";
import { loadGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("ct config mirror parity keeps missing, extra, duplicate, wrong-anchor and group controls", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the production loader dispatches ct-config-mirror-parity", { timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS) }, async ({ repoRoot }) => {
  const corpus = await loadGateCorpus(repoRoot);
  expect(corpus.gates.some((policy) => policy.id === gate.id)).toBe(true);
});

// The pass types every client test and support module (the type judgement resolves each registry call), so it runs
// several times longer than the door-only pass it started as.
const WHOLE_TREE_PASS_FACTOR = 4;

test("the checked-in production and CT config compositions have equal multisets", {
  timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS * WHOLE_TREE_PASS_FACTOR),
}, ({ repoRoot }) => {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: repoRoot,
    project: getWorkspace({ root: repoRoot }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
});
