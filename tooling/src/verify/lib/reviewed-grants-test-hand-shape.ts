// Reviewed grants: test-hand-shape. Each row is a hand-declared shape in an e2e or test support module that the gate
// found when it landed (docs/law/Spine-Testing.md §10). Delete a row when its shape derives from production;
// central liveness reds a row whose shape is gone. A new hand shape derives instead of taking a row.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const POLICY = "test-hand-shape";

/** One grant per `[subject, operation]`; the operation is the gate's `respells:` or `copies:` identity. */
function handShapeGrants(item: string, rows: readonly (readonly [string, string])[]): readonly ReviewedGateGrant[] {
  return rows.map(([subject, operation]) => ({
    id: `${POLICY}:${subject}#${operation}`,
    policyId: POLICY,
    subject,
    operation,
    why: `${subject} declared this shape by hand when the gate landed; it does not derive from the production type it names or copies.`,
    endsWhen: `the shape is imported or derived from its production home (burn-down: docs/work item ${item}); this row then consumes nothing and reds stale.`,
  }));
}

export const REVIEWED_GRANTS_TEST_HAND_SHAPE: readonly ReviewedGateGrant[] = [
  ...handShapeGrants("888", [
    ["tests/e2e/live-context-cutoff.spec.ts", "respells:ContextFitPreview=packages/contracts/src/chat/assemble.ts"],
    ["tests/e2e/live-member-strip.local.spec.ts", "respells:MessagesPage=packages/contracts/src/chat/message-pages.ts"],
    ["tests/e2e/multi-human-visibility.local.spec.ts", "copies:MemberCard=packages/contracts/src/chat/roster.ts#MemberCardView"],
    ["tests/e2e/multi-human-visibility.local.spec.ts", "respells:MessagesPage=packages/contracts/src/chat/message-pages.ts"],
    ["tests/e2e/multi-human-visibility.local.spec.ts", "respells:PersonaRow=packages/server/src/foundation/observability/debug/inspect/config.ts"],
    ["tests/e2e/support/browser-actors.ts", "respells:NavResult=packages/client/src/lib/agent-bridge-handles.ts"],
    ["tests/e2e/support/fixture-provider.ts", "respells:ChatRequest=packages/inference/src/contract/chat.ts"],
    ["tests/e2e/support/trpc.ts", "copies:JournalEntry=packages/contracts/src/rpg/views.ts#RpgJournalEntryView"],
    ["tests/e2e/support/trpc.ts", "copies:NewConnection=packages/server/src/domain/connection/contract/params.ts#ConnectionFields"],
    ["tests/e2e/support/trpc.ts", "copies:TrackerQuest=packages/contracts/src/rpg/views.ts#RpgQuestView"],
    ["tests/e2e/support/trpc.ts", "respells:AssemblyPreview=packages/contracts/src/chat/views.ts"],
    ["tests/e2e/support/trpc.ts", "respells:CanonMessage=packages/server/src/domain/stats/contract/rebuild-from-canon.ts"],
    ["tests/e2e/support/trpc.ts", "respells:ChatDetail=packages/contracts/src/chat/detail.ts"],
    ["tests/e2e/support/trpc.ts", "respells:ContextFitPreview=packages/contracts/src/chat/assemble.ts"],
    ["tests/e2e/support/trpc.ts", "respells:MessagesPage=packages/contracts/src/chat/message-pages.ts"],
    ["tests/e2e/support/trpc.ts", "respells:PresetRow=packages/server/src/foundation/observability/debug/inspect/config.ts"],
    ["tests/e2e/support/trpc.ts", "respells:RpgTraceRecord=packages/server/src/domain/rpg/contract/trace.ts"],
    ["tests/e2e/support/trpc.ts", "respells:ThemeRow=packages/contracts/src/discovery/artifacts.ts"],
    ["tests/e2e/support/trpc.ts", "respells:UserSettings=packages/contracts/src/settings/index.ts"],
    ["tests/e2e/support/trpc.ts", "respells:WireCapture=packages/server/src/foundation/observability/debug/wire-capture.ts"],
  ]),
  ...handShapeGrants("906", [
    [
      "tests/client/features/app-shell/_cascade-fixtures.tsx",
      "copies:ReadingTypographyFixtureProps=packages/client/src/features/app-shell/hooks/use-appearance-root-effects.ts#ReadingTypographyVars",
    ],
    [
      "tests/client/features/chat/_ct-stories.tsx",
      "copies:ReasoningBlockStoryProps=packages/client/src/features/chat/components/reasoning-block.tsx#ReasoningBlockProps",
    ],
    ["tests/client/features/chat/fixtures.ts", "copies:ChatSummaryFixture=packages/contracts/src/chat/views.ts#ChatSummary"],
    ["tests/server/domain/export/_support.ts", "copies:SeedEntryOverrides=packages/contracts/src/world-info/index.ts#EntryView"],
    ["tests/server/domain/import/_support.ts", "copies:ArtAttachCall=packages/server/src/domain/character/contract/params.ts#AttachImportedArtParams"],
    ["tests/server/domain/search/_support.ts", "copies:SeedCharacterSummaryOverrides=packages/contracts/src/discovery/index.ts#BrowseCharacter"],
    ["tests/support/browser/weave-drive.ts", "respells:WeavePoint=packages/ui/src/art/web-weave/web-weave-geometry.ts"],
    ["tests/support/chat/tape.ts", "copies:ErrorOptions=packages/inference/src/contract/errors.ts#ProviderErrorInit"],
    ["tests/support/iso/app-blocking-receipt.ts", "copies:AppBlockingFrameTiming=packages/client/src/lib/motion-stats.ts#LongAnimationFrameEvidence"],
  ]),
];
