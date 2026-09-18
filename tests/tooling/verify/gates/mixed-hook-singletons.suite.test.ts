import { gate as agentBridgeLock } from "../../../../tooling/src/verify/gates/agent-bridge-lock.ts";
import { gate as designAuditRuleProof } from "../../../../tooling/src/verify/gates/design-audit-rule-proof.ts";
import { gate as toolingInstrumentProof } from "../../../../tooling/src/verify/gates/tooling-instrument-proof.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [agentBridgeLock, designAuditRuleProof, toolingInstrumentProof] as const;

test("the §12.6 single-policy mixed-hook conversions keep their two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});
