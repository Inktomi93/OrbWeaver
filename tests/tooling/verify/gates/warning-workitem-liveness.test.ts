// The PIN for `warning-workitem-liveness`: every warning policy's `workItem` names a docs/work item that is
// not done. It drives the declared rows through the production dispatcher, proves the loader registers the
// policy, holds the real tree clean, and proves the policy bites on the real corpus rather than only on its
// fixtures — the founding defect was a warning owner that closed three times before anything asked, so a
// policy that is silent on the real tree for the wrong reason is exactly the failure this pin exists for.
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import { gate } from "../../../../tooling/src/verify/gates/warning-workitem-liveness.ts";
import { loadGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { assertRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATE_GLOBS = ["tooling/src/verify/gates/*.ts"] as const;
/** A work item id far above any the tree will mint, so the control cannot be answered by a real item. */
const ABSENT_ITEM = 99_999;

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

test("a warning policy added to the real corpus with an absent owner is reported", { timeout: scaledBudget(60_000) }, ({ repoRoot }) => {
  const fired = assertRealCorpusLiveness(repoRoot, {
    policy: gate,
    globs: GATE_GLOBS,
    overlays: [
      {
        kind: "add",
        path: "tooling/src/verify/gates/workitem-liveness-probe.ts",
        source:
          'import { defineGate } from "../contract/policy.ts";\n' +
          `export const gate = defineGate({ id: "workitem-liveness-probe", severity: "warning", workItem: ${String(ABSENT_ITEM)} });\n`,
      },
    ],
    messageIncludes: `No item ${String(ABSENT_ITEM)} exists`,
  });
  expect(fired).toHaveLength(1);
});
