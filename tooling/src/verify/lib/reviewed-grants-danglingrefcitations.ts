// Reviewed grants: dangling-ref-citations.
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_DANGLINGREFCITATIONS: readonly ReviewedGateGrant[] = [
  {
    id: "dangling-ref-citations:tooling-src-verify-gates-membership-fan-guard-ts",
    policyId: "dangling-ref-citations",
    subject: "tooling/src/verify/gates/membership-fan-guard.ts:10, 23",
    operation: "dangling-path-cite",
    why: "the gate was renamed or restructured during #1584; the regex-section proposal doc names the pre-conversion gate and line range as a historical citation",
    endsWhen:
      "the owning doc (PROPOSAL-sys.md) is repaired to repoint, strike, or rider this reference; the finding disappears and central zero-use reconciliation stales this row.",
  },
];
