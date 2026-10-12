// Reviewed grants: test-hand-shape. Each row is a hand-declared shape in an e2e or test support module that the gate
// found when it landed (docs/law/Spine-Testing.md §10). Delete a row when its shape derives from production;
// central liveness reds a row whose shape is gone. A new hand shape derives instead of taking a row.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "test-hand-shape";
const BURN_DOWN_ITEM = "906";

/** One grant per `[subject, operation]`; the operation is the gate's `<relation>:<shape>=<production file>#<production type>` identity. */
function handShapeGrants(rows: readonly (readonly [string, string])[]): readonly ReviewedGateGrant[] {
  return rows.map(([subject, operation]) => ({
    id: `${POLICY}:${subject}#${operation}`,
    policyId: POLICY,
    subject,
    operation,
    why: `${subject} declared this shape by hand when the gate landed; a value in the test tree is bound to the production type its operation names.`,
    endsWhen: `the shape is imported or derived from its production home (burn-down: docs/work item ${BURN_DOWN_ITEM}); this row then consumes nothing and reds stale.`,
  }));
}

export const REVIEWED_GRANTS_TEST_HAND_SHAPE: readonly ReviewedGateGrant[] = handShapeGrants([
  ["tests/server/domain/import/_support.ts", "copies:ArtAttachCall=packages/server/src/domain/import/contract/service.ts#AttachImportedArt.args"],
  ["tests/server/domain/import/_support.ts", "copies:BulkChatsCall=packages/server/src/domain/import/contract/service.ts#BulkImportChatsOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:BulkPersonasCall=packages/server/src/domain/import/contract/service.ts#BulkImportPersonasOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:CreateCall=packages/server/src/domain/import/contract/service.ts#CreateImportedCharacter.args"],
  ["tests/server/domain/import/_support.ts", "copies:LinkBooksCall=packages/server/src/domain/import/contract/service.ts#LinkCarriedBooksOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:LorebookCall=packages/server/src/domain/import/contract/service.ts#BulkImportLorebookOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:StoreCall=packages/server/src/domain/import/contract/service.ts#StoreImportAsset.args"],
  ["tests/server/domain/import/_support.ts", "copies:TagAttachCall=packages/server/src/domain/import/contract/service.ts#AttachImportedCardTag.args"],
  ["tests/support/browser/weave-drive.ts", "copies:WeavePoint=packages/ui/src/art/web-weave/web-weave-geometry.ts#WeavePoint"],
  ["tests/support/iso/app-blocking-receipt.ts", "narrows:AppBlockingFrameTiming=packages/client/src/lib/motion-stats.ts#LongAnimationFrameEvidence"],
  ["tests/support/node/fake-relay.ts", "widens:FakeRelaySeams=packages/server/src/entry/lifecycle.ts#LifecycleOptions.relaySeams"],
]);
