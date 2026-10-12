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
    [
      "tests/client/features/app-shell/_cascade-fixtures.tsx",
      "copies:ReadingTypographyFixtureProps=packages/client/src/features/app-shell/hooks/use-appearance-root-effects.ts#ReadingTypographyVars",
    ],
    [
      "tests/client/features/chat/_ct-stories.tsx",
      "copies:ReasoningBlockStoryProps=packages/client/src/features/chat/components/reasoning-block.tsx#ReasoningBlockProps",
    ],
    ["tests/client/features/chat/_ct-stories.tsx", "overlaps:PersonaNameStoryEntry=packages/contracts/src/chat/producers.ts#ChatPersonaIdentity"],
    ["tests/client/features/chat/fixtures.ts", "copies:ChatSummaryFixture=packages/contracts/src/chat/views.ts#ChatSummary"],
    ["tests/server/domain/admin/_support.ts", "overlaps:SeedUserOverrides=packages/server/src/domain/admin/contract/views.ts#AdminUserView"],
    ["tests/server/domain/automation/_support.ts", "overlaps:HarnessOverrides=packages/server/src/domain/automation/contract/service.ts#AutomationContext"],
    ["tests/server/domain/export/_support.ts", "copies:SeedEntryOverrides=packages/contracts/src/world-info/index.ts#EntryView"],
    ["tests/server/domain/import/_support.ts", "copies:ArtAttachCall=packages/server/src/domain/character/contract/params.ts#AttachImportedArtParams"],
    ["tests/server/domain/preset/_support.ts", "overlaps:SeedPresetOverrides=packages/server/src/domain/preset/contract/views.ts#PresetDetail"],
    ["tests/server/domain/search/_support.ts", "copies:SeedCharacterSummaryOverrides=packages/contracts/src/discovery/index.ts#BrowseCharacter"],
    ["tests/support/node/chat/tape.ts", "copies:ErrorOptions=packages/inference/src/contract/errors.ts#ProviderErrorInit"],
    ["tests/support/iso/app-blocking-receipt.ts", "copies:AppBlockingFrameTiming=packages/client/src/lib/motion-stats.ts#LongAnimationFrameEvidence"],
  ]),
  // The overlap lands on the debug inspector's row, which only shares the columns; the seeder writes `characters`.
  {
    id: `${POLICY}:tests/server/domain/world-info/_support.ts#overlaps:SeedCharacterOverrides`,
    policyId: POLICY,
    subject: "tests/server/domain/world-info/_support.ts",
    operation: "overlaps:SeedCharacterOverrides=packages/server/src/foundation/observability/debug/inspect/config.ts#CharacterDetailRow",
    why: "tests/server/domain/world-info/_support.ts declared its seed overrides by hand; the fields are columns of the `characters` insert row, which the gate matched through the debug inspector's row of the same columns.",
    endsWhen:
      "the overrides derive from the `characters` insert type in packages/db/src/schema/character.ts, or the seeder moves to the shared character factory (burn-down: docs/work item 906); this row then consumes nothing and reds stale.",
  },
];
