// Reviewed grants: test-hand-shape. Each row is a hand-declared shape in an e2e or test support module that the gate
// found when it landed (docs/law/Spine-Testing.md §10). Delete a row when its shape derives from production;
// central liveness reds a row whose shape is gone. A new hand shape derives instead of taking a row.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "test-hand-shape";

/** One grant per `[subject, operation]`; the operation is the gate's `copies:` or `overlaps:` identity. */
function handShapeGrants(item: string, rows: readonly (readonly [string, string])[]): readonly ReviewedGateGrant[] {
  return rows.map(([subject, operation]) => ({
    id: `${POLICY}:${subject}#${operation}`,
    policyId: POLICY,
    subject,
    operation,
    why: `${subject} declared this shape by hand when the gate landed; its fields copy, or drifted from, the production shape its operation names.`,
    endsWhen: `the shape is imported or derived from its production home (burn-down: docs/work item ${item}); this row then consumes nothing and reds stale.`,
  }));
}

export const REVIEWED_GRANTS_TEST_HAND_SHAPE: readonly ReviewedGateGrant[] = [
  ...handShapeGrants("906", [
    ["tests/support/node/chat/tape.ts", "copies:ErrorOptions=packages/inference/src/contract/errors.ts#ProviderErrorInit"],
    ["tests/support/iso/app-blocking-receipt.ts", "copies:AppBlockingFrameTiming=packages/client/src/lib/motion-stats.ts#LongAnimationFrameEvidence"],
  ]),
];
