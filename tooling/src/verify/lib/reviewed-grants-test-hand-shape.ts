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
  [
    "tests/client/components/character-picker.fixtures.tsx",
    "narrows:CharacterPickerHarnessProps=packages/client/src/components/character-picker.tsx#CharacterPickerProps",
  ],
  [
    "tests/client/components/tag-picker-dialog.fixtures.tsx",
    "narrows:TagPickerDialogHarnessProps=packages/client/src/components/tag-picker-dialog.tsx#TagPickerDialogProps",
  ],
  [
    "tests/client/data/_ct-stories.tsx",
    "copies:NotificationsParams=packages/server/src/foundation/observability/debug/inspect/automation-fires.ts#AutomationFireFilter",
  ],
  [
    "tests/client/data/_ct-stories.tsx",
    "narrows:UpdateSectionVars=packages/client/src/features/credentials/hooks/use-connections-mutations.ts#UtilityPresetPatchVars",
  ],
  [
    "tests/client/features/app-shell/_cascade-fixtures.tsx",
    "copies:ReadingTypographyFixtureProps=packages/client/src/features/app-shell/hooks/use-appearance-root-effects.ts#ReadingTypographyVars",
  ],
  ["tests/client/features/character/_ct-stories.tsx", "narrows:CharacterEditorSurfaceStoryProps=packages/server/src/infra/image/index.ts#ImageInfo"],
  [
    "tests/client/features/chat/_ct-stories.tsx",
    "copies:ReasoningBlockStoryProps=packages/client/src/features/chat/components/reasoning-block.tsx#ReasoningBlockProps",
  ],
  ["tests/client/features/chat/_ct-stories.tsx", "narrows:CharacterStoryEntry=packages/client/src/state/chat-list-filter-store.ts#ChatListCharacterFilter"],
  [
    "tests/client/features/chat/_ct-stories.tsx",
    "narrows:CommittedSettingsTabStoryProps=packages/client/src/features/chat/components/settings-context-tab.tsx#CommittedSettingsTabProps",
  ],
  ["tests/client/features/chat/_ct-stories.tsx", "narrows:ComposerStoryProps=packages/client/src/features/chat/components/composer.tsx#ComposerProps"],
  [
    "tests/client/features/chat/_ct-stories.tsx",
    "narrows:MessageActionsRowStoryProps=packages/client/src/features/chat/components/message-actions-row.tsx#MessageActionsRowProps",
  ],
  [
    "tests/client/features/chat/_ct-stories.tsx",
    "narrows:SwipeStripStoryProps=packages/client/src/features/chat/components/message-reactions.tsx#MessageReactionsProps",
  ],
  [
    "tests/client/features/chat/_jump-to-latest-stories.tsx",
    "narrows:RegressionItem=packages/client/src/features/chat/surfaces/command-palette-surface.tsx#GoToSection",
  ],
  ["tests/client/features/chat/fixtures.ts", "narrows:ChatSummaryFixture=packages/contracts/src/chat/views.ts#ChatSummary"],
  ["tests/client/features/refinery/_ct-stories.tsx", "copies:RefineryDataStoryProps=packages/client/src/lib/registry-contracts.ts#RefineryContextState"],
  ["tests/client/features/refinery/_ct-stories.tsx", "copies:SetupTabBodyStoryProps=packages/client/src/lib/registry-contracts.ts#RefineryContextState"],
  ["tests/client/features/refinery/_ct-stories.tsx", "narrows:HeroRampStoryProps=packages/contracts/src/chat/backfill.ts#ImportWindow"],
  [
    "tests/client/features/refinery/_ct-stories.tsx",
    "narrows:SchemaEditorStoryProps=packages/client/src/features/refinery/components/schema-editor-dialog.tsx#SchemaEditorDialogProps",
  ],
  ["tests/client/forms/editor/_ct-stories.tsx", "copies:BoundaryValues=packages/server/src/domain/plugin/contract/results.ts#PluginDisplayTransformResult"],
  ["tests/client/forms/editor/_ct-stories.tsx", "copies:SavedDraftValues=packages/server/src/domain/plugin/contract/results.ts#PluginDisplayTransformResult"],
  ["tests/server/domain/admin/_support.ts", "narrows:SeedUserOverrides=packages/db/src/schema/users.ts#users.$inferInsert"],
  [
    "tests/server/domain/assets/_support.ts",
    "narrows:SeedPersonaOverrides=packages/client/src/features/character/lib/character-library-lens.ts#LibraryChipTag",
  ],
  ["tests/server/domain/assets/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/character/_support.ts", "narrows:SeedAssetOverrides=packages/db/src/schema/assets.ts#assets.$inferInsert"],
  ["tests/server/domain/character/_support.ts", "narrows:SeedRawCharacterOverrides=packages/db/src/schema/character.ts#characters.$inferInsert"],
  ["tests/server/domain/character/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/chat/_scenario.ts", "narrows:SendOptions=packages/server/src/domain/chat/contract/params.ts#ImpersonateStreamParams"],
  ["tests/server/domain/credentials/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/embeddings/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/export/_support.ts", "narrows:SeedAssetOverrides=packages/db/src/schema/assets.ts#assets.$inferInsert"],
  ["tests/server/domain/export/_support.ts", "narrows:SeedEntryOverrides=packages/contracts/src/world-info/index.ts#EntryView"],
  ["tests/server/domain/export/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/admin/contract/params.ts#CreateUserParams"],
  ["tests/server/domain/import/_support.ts", "copies:ArtAttachCall=packages/server/src/domain/character/contract/params.ts#AttachImportedArtParams"],
  ["tests/server/domain/import/_support.ts", "copies:ArtAttachCall=packages/server/src/domain/import/contract/service.ts#AttachImportedArt.args"],
  ["tests/server/domain/import/_support.ts", "copies:BulkChatsCall=packages/server/src/domain/import/contract/service.ts#BulkImportChatsOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:BulkPersonasCall=packages/server/src/domain/import/contract/service.ts#BulkImportPersonasOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:CreateCall=packages/server/src/domain/import/contract/service.ts#CreateImportedCharacter.args"],
  ["tests/server/domain/import/_support.ts", "copies:FindByHandleCall=packages/server/src/domain/character/contract/params.ts#FindByHandleParams"],
  ["tests/server/domain/import/_support.ts", "copies:FindCall=packages/server/src/domain/character/contract/params.ts#FindByImportHashParams"],
  ["tests/server/domain/import/_support.ts", "copies:LinkBooksCall=packages/server/src/domain/import/contract/service.ts#LinkCarriedBooksOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:LorebookCall=packages/server/src/domain/import/contract/service.ts#BulkImportLorebookOp.args"],
  ["tests/server/domain/import/_support.ts", "copies:StoreCall=packages/server/src/domain/import/contract/service.ts#StoreImportAsset.args"],
  ["tests/server/domain/import/_support.ts", "copies:TagAttachCall=packages/server/src/domain/import/contract/service.ts#AttachImportedCardTag.args"],
  ["tests/server/domain/import/_support.ts", "copies:TagAttachCall=packages/server/src/domain/tag/contract/params.ts#DetachCardTagByNameParams"],
  ["tests/server/domain/persona/_support.ts", "narrows:SeedAssetOverrides=packages/db/src/schema/assets.ts#assets.$inferInsert"],
  ["tests/server/domain/persona/_support.ts", "narrows:SeedCharacterOverrides=packages/db/src/schema/character.ts#characters.$inferInsert"],
  ["tests/server/domain/persona/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/refinery/_support.ts", "narrows:RefineryHarnessOptions=packages/server/src/domain/refinery/contract/prompts.ts#StageBudgetFitArgs"],
  ["tests/server/domain/regex/_support.ts", "narrows:HarnessOverrides=packages/server/src/domain/regex/contract/service.ts#RegexContext"],
  ["tests/server/domain/regex/_support.ts", "narrows:SeedScriptOverrides=packages/server/src/domain/regex/contract/rows.ts#anonymous"],
  ["tests/server/domain/regex/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/roster-preset/_support.ts", "copies:HostCall=packages/server/src/domain/automation/contract/params.ts#ListRulesParams"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedAssetOverrides=packages/db/src/schema/assets.ts#assets.$inferInsert"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedCharacterEmbeddingOverrides=packages/db/src/schema/embeddings.ts#characterEmbeddings.$inferInsert"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedCharacterOverrides=packages/db/src/schema/character.ts#characters.$inferInsert"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedCharacterSummaryOverrides=packages/contracts/src/discovery/index.ts#DossierNeighbor"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedDigestOverrides=packages/db/src/schema/embeddings.ts#chatDigests.$inferInsert"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedDocumentChunkOverrides=packages/db/src/schema/embeddings.ts#documentChunks.$inferInsert"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedDocumentOverrides=packages/server/src/domain/persona/contract/views.ts#PersonaListView"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedSegmentOverrides=packages/db/src/schema/embeddings.ts#chatSegments.$inferInsert"],
  ["tests/server/domain/search/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/settings/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/server/domain/world-info/_support.ts", "narrows:HarnessOverrides=packages/server/src/domain/world-info/contract/service.ts#WorldInfoContext"],
  [
    "tests/server/domain/world-info/_support.ts",
    "narrows:SeedCharacterOverrides=packages/server/src/foundation/observability/debug/inspect/config.ts#CharacterDetailRow",
  ],
  ["tests/server/domain/world-info/_support.ts", "narrows:SeedPersonaOverrides=packages/server/src/domain/persona/contract/views.ts#PersonaListView"],
  ["tests/server/domain/world-info/_support.ts", "narrows:SeedUserOverrides=packages/server/src/domain/sessions/contract/results.ts#ProvisionCandidate"],
  ["tests/showcase-plugins/_ct-stories.tsx", "copies:RegisteredFrame=packages/ui/src/content/sandbox-frame/sandbox-frame.tsx#SandboxFrameProps"],
  ["tests/support/browser/touch-floor.ts", "copies:HitBox=packages/ui/src/art/web-weave/web-weave-geometry.ts#WeavePoint"],
  ["tests/support/browser/weave-drive.ts", "copies:WeavePoint=packages/ui/src/art/web-weave/web-weave-geometry.ts#WeavePoint"],
  ["tests/support/iso/app-blocking-receipt.ts", "narrows:AppBlockingFrameTiming=packages/client/src/lib/motion-stats.ts#LongAnimationFrameEvidence"],
  ["tests/support/node/atlas-guest.ts", "narrows:AtlasToast=packages/contracts/src/plugin/ui.ts#PluginToast"],
  ["tests/support/node/chat-and-inbox-reads-empty.ts", "copies:EmptyInboxPage=packages/contracts/src/notifications/index.ts#ListInboxResult"],
  ["tests/support/node/chat/assertions.ts", "copies:EventSequenceOptions=packages/client/src/data/invalidation-reads.ts#InvalidateFilter"],
  ["tests/support/node/chat/tape.ts", "narrows:ErrorOptions=packages/inference/src/contract/errors.ts#ProviderErrorInit"],
  ["tests/support/node/chat/tape.ts", "narrows:RateLimitOptions=packages/inference/src/contract/errors.ts#ProviderErrorInit"],
  ["tests/support/node/fake-relay.ts", "widens:FakeRelaySeams=packages/server/src/entry/lifecycle.ts#LifecycleOptions.relaySeams"],
  ["tests/support/node/matchers.ts", "narrows:TrpcErrorLike=packages/client/src/features/user-admin/lib/share-model.ts#ShareStartFailure"],
  ["tests/support/node/mcp-in-memory.ts", "narrows:McpCallResult=packages/inference/src/backends/agent-sdk/index.ts#AgentToolResult"],
  ["tests/support/node/route-orb-socket.ts", "narrows:SubscriptionErrorPayload=packages/server/src/transport/trpc/subscriptions.ts#SubscriptionErrorFrame"],
  ["tests/ui/code-editor/code-editor.fixtures.tsx", "copies:ReadOnlyEditorProps=packages/ui/src/primitives/tabs/tabs.tsx#TabsPanelProps"],
  [
    "tests/ui/primitives/file-trigger/file-trigger.fixtures.tsx",
    "narrows:FileTriggerHarnessProps=packages/client/src/features/chat/lib/chat-control-availability.ts#ChatControlAvailability",
  ],
  [
    "tests/ui/primitives/media-grid/media-grid.fixtures.tsx",
    "narrows:CaughtState=packages/ui/src/primitives/aria-announcer/aria-announcer.tsx#AriaAnnouncerProps",
  ],
  [
    "tests/ui/primitives/message-list/message-list.fixtures.tsx",
    "narrows:CaughtState=packages/ui/src/primitives/aria-announcer/aria-announcer.tsx#AriaAnnouncerProps",
  ],
  [
    "tests/ui/primitives/message-list/message-list.fixtures.tsx",
    "narrows:FixtureItem=packages/client/src/features/chat/surfaces/command-palette-surface.tsx#GoToSection",
  ],
  [
    "tests/ui/primitives/sortable/sortable.fixtures.tsx",
    "narrows:FixtureItem=packages/client/src/features/chat/surfaces/command-palette-surface.tsx#GoToSection",
  ],
  [
    "tests/ui/primitives/virtual-list/virtual-list.fixtures.tsx",
    "narrows:CaughtState=packages/ui/src/primitives/aria-announcer/aria-announcer.tsx#AriaAnnouncerProps",
  ],
  [
    "tests/ui/primitives/virtual-list/virtual-list.fixtures.tsx",
    "narrows:FixtureItem=packages/client/src/features/chat/surfaces/command-palette-surface.tsx#GoToSection",
  ],
  ["tests/ui/variant-arm-matrix.plan.ts", "narrows:DiscoveredTv=packages/client/src/features/config/hooks/use-theme-mutations.ts#RemoveThemeVars"],
]);
