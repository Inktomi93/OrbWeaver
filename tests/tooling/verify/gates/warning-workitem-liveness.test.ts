// The PIN for `warning-workitem-liveness`: every warning policy's `workItem` names a docs/work item that is
// not done. It drives the declared rows through the production dispatcher, proves the loader registers the
// policy and holds the real tree clean. Its real-corpus positive control is an arm in
// `_liveness/tooling.ts`, run by the one shared liveness runner.
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import { gate } from "../../../../tooling/src/verify/gates/warning-workitem-liveness.ts";
import { loadGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATE_GLOBS = ["tooling/src/verify/gates/*.ts"] as const;

test("every declared row holds through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the production loader registers warning-workitem-liveness", async ({ repoRoot }) => {
  const corpus = await loadGateCorpus(repoRoot);
  expect(corpus.gates.some((policy) => policy.id === gate.id)).toBe(true);
});

test("every warning policy on the tree names a live docs/work item", { timeout: scaledBudget(60_000) }, ({ repoRoot }) => {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: repoRoot,
    project: getWorkspace({ root: repoRoot, globs: GATE_GLOBS.map((glob) => `${repoRoot}/${glob}`) }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
});
