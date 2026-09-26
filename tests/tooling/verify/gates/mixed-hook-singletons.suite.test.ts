import { gate as agentBridgeLock } from "../../../../tooling/src/verify/gates/agent-bridge-lock.ts";
import { gate as designAuditRuleProof } from "../../../../tooling/src/verify/gates/design-audit-rule-proof.ts";
import { gate as toolingInstrumentProof } from "../../../../tooling/src/verify/gates/tooling-instrument-proof.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const policies = [agentBridgeLock, designAuditRuleProof, toolingInstrumentProof] as const;

// The three policies' declared rows through the conformance runner. MEASURED: 4.6 s to 4.8 s alone at per-core load
// 0.2, and killed at 5.2 s by the 5 s default inside a whole-tree barrier. The base is twice that loaded lower bound.
const FAMILY_PROOFS_TIMEOUT = scaledBudget(12_000);

test("the §12.6 single-policy mixed-hook conversions keep their two-sided proofs", { timeout: FAMILY_PROOFS_TIMEOUT }, () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});
