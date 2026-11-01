// The look-alike shapes judged distinct concepts: the truth list `pnpm unwired ports` reports as `distinct`, never as
// open review work. A pair is distinct only with a judgment: no real flow, no shared rows and no owner that merges
// them. Each pair is recorded once, from either side; a copy not listed beside its shape stays a `review` target.

/** A shape as the census names it: the file that declares it and its declared or member name. */
type ShapeRef = `packages/${string}#${string}`;

interface DistinctLookalike {
  readonly shape: ShapeRef;
  readonly distinctFrom: readonly [ShapeRef, ...ShapeRef[]];
  /** Why the shapes are different concepts, in one line. */
  readonly reason: string;
}

export const DISTINCT_LOOKALIKES = [
  {
    shape: "packages/client/src/data/import-tree-plan.ts#SkippedTreeFile",
    distinctFrom: ["packages/contracts/src/refinery/schema-forge.ts#ForgeTranspileDrop"],
    reason: "A client upload-preflight row; the schema-forge drop is a transpiler row: only {path, reason} is shared.",
  },
  {
    shape: "packages/client/src/features/character/components/character-import-dialog.tsx#CharacterImportDialogProps",
    distinctFrom: ["packages/client/src/features/chat/components/chat-import-dialog.tsx#ChatImportDialogProps"],
    reason: "Two features' import dialogs sharing only open and onOpenChange; neither renders the other.",
  },
  {
    shape: "packages/client/src/features/chat/components/art-slot.tsx#ArtFailedReport",
    distinctFrom: [
      "packages/client/src/components/confirm-dialog.tsx#onOpenChange",
      "packages/client/src/components/form-dialog.tsx#onOpenChange",
      "packages/client/src/components/model-run-confirm-dialog.tsx#onOpenChange",
      "packages/client/src/components/query-boundary.tsx#onSettled",
      "packages/client/src/components/reindex-confirm.tsx#GuardedWrite",
      "packages/client/src/components/setting-switch-row.tsx#onChange",
      "packages/client/src/components/tag-picker-dialog.tsx#onOpenChange",
      "packages/client/src/features/app-shell/components/bug-report-button.tsx#onOpenChange",
      "packages/client/src/features/app-shell/components/modal-host.tsx#onOpenChange",
      "packages/client/src/features/character/components/character-create-actions.tsx#onOpenChange",
      "packages/client/src/features/character/components/character-import-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/anchors/character-gallery-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/add-chat-book-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/add-chat-document-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/add-chat-script-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/chat-documents-section.tsx#onSetHidden",
      "packages/client/src/features/chat/components/chat-import-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/chat-options-menu.tsx#setMode",
      "packages/client/src/features/chat/components/chat-summary-row.tsx#onToggleStar",
      "packages/client/src/features/chat/components/gallery-add-picker.tsx#onOpenChange",
      "packages/client/src/features/chat/components/gallery-lightbox.tsx#onSettled",
      "packages/client/src/features/chat/components/invite-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/member-card-viewer.tsx#onOpenChange",
      "packages/client/src/features/chat/components/memory-on-confirm.tsx#onOpenChange",
      "packages/client/src/features/chat/components/reaction-picker.tsx#onOpenChange",
      "packages/client/src/features/chat/components/reattribute-from-here.tsx#onOpenChange",
      "packages/client/src/features/chat/components/rename-chat-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/rewrite-dialog.tsx#onOpenChange",
      "packages/client/src/features/chat/components/room-overrides-form.tsx#onOpenChange",
      "packages/client/src/features/chat/components/row-reaction-picker.tsx#onOpenChange",
      "packages/client/src/features/chat/components/saved-replies-picker.tsx#onOpenChange",
      "packages/client/src/features/chat/components/talkativeness-popover.tsx#onOpenChange",
      "packages/client/src/features/chat/components/use-rewrite-modal.ts#setOpen",
      "packages/client/src/features/chat/components/variant-wire-viewer.tsx#onOpenChange",
      "packages/client/src/features/chat/hooks/use-gallery-focus.ts#onLightboxSettled",
      "packages/client/src/features/credentials/components/add-connection-dialog.tsx#onOpenChange",
      "packages/client/src/features/credentials/components/add-model-on-key-dialog.tsx#onOpenChange",
      "packages/client/src/features/databank/components/databank-rename-dialog.tsx#onOpenChange",
      "packages/client/src/features/persona/components/persona-from-character-dialog.tsx#onOpenChange",
      "packages/client/src/features/plugin/components/plugin-leaf-nodes.tsx#onCheckedChange",
      "packages/client/src/features/preset/components/preset-import-dialog.tsx#onOpenChange",
      "packages/client/src/features/preset/components/preset-rename-dialog.tsx#onOpenChange",
      "packages/client/src/features/refinery/components/manual-rewrite-dialog.tsx#onOpenChange",
      "packages/client/src/features/refinery/components/original-card-dialog.tsx#onOpenChange",
      "packages/client/src/features/refinery/components/schema-editor-dialog.tsx#onOpenChange",
      "packages/client/src/features/refinery/components/schema-editor-dialog.tsx#setNameFilled",
      "packages/client/src/features/refinery/components/scope-editor-dialog.tsx#onOpenChange",
      "packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx#setOpen",
      "packages/client/src/features/regex/components/regex-bulk-placement-dialog.tsx#onOpenChange",
      "packages/client/src/features/user-admin/components/admin-create-user-dialog.tsx#onOpenChange",
      "packages/client/src/features/user-admin/lib/admin-model.ts#onOpenChange",
      "packages/client/src/features/user-admin/components/admin-override-field.tsx#onSet",
      "packages/client/src/features/user-admin/components/admin-user-row.tsx#onSetEnabled",
      "packages/client/src/features/workloads/components/create-schedule-dialog.tsx#onOpenChange",
      "packages/client/src/features/workloads/components/run-workload-dialog.tsx#onOpenChange",
      "packages/client/src/features/workloads/components/schedules-section.tsx#onToggle",
      "packages/client/src/features/world-info/components/book-details-dialog.tsx#onOpenChange",
      "packages/client/src/lib/agent-bridge.ts#setMotionAuditDropTrackingPaused",
      "packages/ui/src/content/lightbox/lightbox.tsx#onOpenChange",
      "packages/ui/src/primitives/reveal-gate/reveal-gate.tsx#onReveal",
    ],
    reason: "A bare (boolean) => void callback: each art, dialog and toggle callback answers its own component, no flow.",
  },
  {
    shape: "packages/client/src/features/chat/components/chat-books-section.tsx#ChatBooksSectionProps",
    distinctFrom: [
      "packages/client/src/features/chat/components/chat-documents-section.tsx#ChatDocumentsSectionProps",
      "packages/client/src/features/chat/components/injections-manager.tsx#InjectionsManagerProps",
      "packages/client/src/features/chat/components/regex-on-screen-group.tsx#RegexOnScreenGroupProps",
      "packages/client/src/features/chat/components/regex-section.tsx#RegexSectionProps",
    ],
    reason: "Separate chat section components' {chatId, isHost} props; no section renders another.",
  },
  {
    shape: "packages/client/src/features/chat/components/chat-documents-section.tsx#ChatDocumentsSectionProps",
    distinctFrom: [
      "packages/client/src/features/chat/components/injections-manager.tsx#InjectionsManagerProps",
      "packages/client/src/features/chat/components/regex-on-screen-group.tsx#RegexOnScreenGroupProps",
      "packages/client/src/features/chat/components/regex-section.tsx#RegexSectionProps",
    ],
    reason: "Separate chat section components' {chatId, isHost} props; no section renders another.",
  },
  {
    shape: "packages/client/src/features/chat/components/injections-manager.tsx#InjectionsManagerProps",
    distinctFrom: [
      "packages/client/src/features/chat/components/regex-on-screen-group.tsx#RegexOnScreenGroupProps",
      "packages/client/src/features/chat/components/regex-section.tsx#RegexSectionProps",
    ],
    reason: "Separate chat section components' {chatId, isHost} props; no section renders another.",
  },
  {
    shape: "packages/client/src/features/chat/components/regex-on-screen-group.tsx#RegexOnScreenGroupProps",
    distinctFrom: ["packages/client/src/features/chat/components/regex-section.tsx#RegexSectionProps"],
    reason: "Separate chat section components' {chatId, isHost} props; no section renders another.",
  },
  {
    shape: "packages/client/src/features/config/components/config-group-placeholder.tsx#ConfigGroupPlaceholderProps",
    distinctFrom: ["packages/client/src/state/section-registry.ts#SectionPlaceholderCopy"],
    reason: "Placeholder props the config surface fills from a group; section-registry copy never reaches it.",
  },
  {
    shape: "packages/client/src/features/databank/components/databank-rename-dialog.tsx#DatabankRenameDialogProps",
    distinctFrom: ["packages/client/src/features/preset/components/preset-rename-dialog.tsx#PresetRenameDialogProps"],
    reason: "Two features' rename dialogs: a shape-only match with no flow.",
  },
  {
    shape: "packages/client/src/features/discovery/components/corpus-controls.tsx#ParamToggleOption",
    distinctFrom: [
      "packages/client/src/state/config-group-registry.ts#ConfigSettingOption",
      "packages/contracts/src/plugin/ui.ts#PluginSelectOption",
      "packages/kit/src/macro/user-macros.ts#UserMacroInputOption",
    ],
    reason: "The discovery toggle's {value, label}; each option type belongs to its own owner with no flow between them.",
  },
  {
    shape: "packages/client/src/features/discovery/lib/corpus-duplicate-groups.ts#ArtCliqueMember",
    distinctFrom: ["packages/contracts/src/databank/index.ts#DocumentCharacterRef", "packages/contracts/src/persona/schemas.ts#ConnectedCharacterView"],
    reason: "A local {id, name} built from an art pair; the databank and persona views are other domains' reads.",
  },
  {
    shape: "packages/client/src/features/discovery/surfaces/corpus-dossier-surface.tsx#CorpusDossierSurfaceProps",
    distinctFrom: ["packages/client/src/features/stats/surfaces/analytics-character-surface.tsx#AnalyticsCharacterSurfaceProps"],
    reason: "Two drill-in surfaces taking {characterId, onBack}; no flow.",
  },
  {
    shape: "packages/client/src/features/plugin/components/plugin-log-panel.tsx#PluginLogPanelProps",
    distinctFrom: ["packages/contracts/src/plugin/view.ts#PluginDisplayTransformView"],
    reason: "Log panel props; the plugin transform view is a wire view of another concept.",
  },
  {
    shape: "packages/client/src/features/rpg/components/rpg-scene-cards.tsx#RpgSceneCardsProps",
    distinctFrom: [
      "packages/client/src/features/chat/hooks/use-context-panel-mutations.ts#SetCharactersCanReactVars",
      "packages/client/src/features/chat/hooks/use-context-panel-mutations.ts#SetHostDisplayScriptsVars",
      "packages/client/src/features/chat/hooks/use-context-panel-mutations.ts#SetMemberPersonaLoreVars",
      "packages/client/src/features/chat/hooks/use-context-panel-mutations.ts#SetOfferChoicesVars",
      "packages/client/src/features/chat/hooks/use-context-panel-mutations.ts#SetReactionsEnabledVars",
    ],
    reason: "Rpg component props; the matches are chat mutation variables, another layer and owner.",
  },
  {
    shape: "packages/client/src/features/tag/hooks/use-tag-library.ts#TagLibraryFact",
    distinctFrom: ["packages/client/src/lib/collection-contracts.ts#CollectionInsight"],
    reason: "Tag library facts render only on its own surface; collection insights are the collection host's contribution data.",
  },
  {
    shape: "packages/client/src/features/user-admin/components/admin-create-user-dialog.tsx#AdminCreateUserDialogProps",
    distinctFrom: ["packages/client/src/features/workloads/components/create-schedule-dialog.tsx#CreateScheduleDialogProps"],
    reason: "A user-admin dialog and a workloads dialog with the same three props; no flow.",
  },
  {
    shape: "packages/contracts/src/persona/owner-ops.ts#ExportPersonaParams",
    distinctFrom: [
      "packages/server/src/domain/persona/contract/params.ts#DuplicatePersonaParams",
      "packages/server/src/domain/persona/contract/params.ts#GetPersonaParams",
      "packages/server/src/domain/persona/contract/params.ts#ListConnectedCharactersParams",
      "packages/server/src/domain/persona/contract/params.ts#RemovePersonaParams",
      "packages/server/src/domain/world-info/contract/params.ts#ListForPersonaParams",
    ],
    reason: "Each persona verb owns its params over PersonaActorParams; world-info's look-alike extends another actor type.",
  },
  {
    shape: "packages/inference/src/contract/http.ts#ProviderCapabilityDrop",
    distinctFrom: ["packages/server/src/foundation/observability/contract/wire-capture.ts#WireWarning"],
    reason: "A provider-log drop row and the server wire-capture warning: different packages, sinks and lifetimes.",
  },
  {
    shape: "packages/inference/src/contract/structured.ts#PlannedTool",
    distinctFrom: ["packages/inference/src/contract/chat.ts#WireTool"],
    reason: "PlannedTool extends WireTool and adds strict: derived, not a copy.",
  },
  {
    shape: "packages/kit/src/chunk/split.ts#Span",
    distinctFrom: ["packages/kit/src/content/index.ts#HiddenRun"],
    reason: "The chunker's split spans and the content scanner's hidden runs: different engines sharing {start, end}.",
  },
  {
    shape: "packages/server/src/domain/admin/contract/params.ts#RevokeSessionParams",
    distinctFrom: ["packages/server/src/entry/auth/seam.ts#CookieAdmission"],
    reason: "An admin verb's input and the auth seam's private cookie admission; neither feeds the other.",
  },
  {
    shape: "packages/server/src/domain/admin/contract/params.ts#EmbedCharacterCardParams",
    distinctFrom: [
      "packages/contracts/src/character/index.ts#DuplicateCharacterParams",
      "packages/contracts/src/character/index.ts#GetCardParams",
      "packages/contracts/src/character/index.ts#GetCharacterParams",
      "packages/server/src/domain/character/contract/params.ts#ListSnapshotsParams",
      "packages/server/src/domain/character/contract/params.ts#RemoveCharacterParams",
      "packages/server/src/domain/persona/contract/params.ts#ListConnectedParams",
      "packages/server/src/domain/regex/contract/params.ts#ListForCharacterParams",
      "packages/server/src/domain/world-info/contract/params.ts#ListForCharacterParams",
    ],
    reason: "A verb input over its own actor type; the characterId look-alikes are other verbs and other actor types.",
  },
  {
    shape: "packages/server/src/domain/automation/contract/params.ts#RulePresetProvenance",
    distinctFrom: ["packages/contracts/src/roster-preset/index.ts#RosterPresetRuleView"],
    reason: "What a preset-made rule stores on its row; the roster preset rule view is another table and owner.",
  },
  {
    shape: "packages/server/src/domain/automation/contract/params.ts#RunRuleNowParams",
    distinctFrom: ["packages/contracts/src/automation/index.ts#DeleteRuleParams"],
    reason: "Two automation verbs' inputs that both name a rule: two verbs, not one concept.",
  },
  {
    shape: "packages/server/src/domain/automation/contract/params.ts#ResolveStreamAuthorityParams",
    distinctFrom: [
      "packages/contracts/src/automation/index.ts#ListRulesParams",
      "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams",
      "packages/server/src/domain/databank/contract/params.ts#ListActiveForChatParams",
      "packages/server/src/domain/regex/contract/params.ts#ListForChatParams",
      "packages/server/src/domain/regex/contract/params.ts#ListRoomDisplayScriptsParams",
      "packages/server/src/domain/rpg/contract/params.ts#DetachDanglingPointerParams",
      "packages/server/src/domain/rpg/contract/params.ts#ListCheckpointsParams",
      "packages/server/src/domain/rpg/contract/params.ts#ReadGameParams",
      "packages/server/src/domain/rpg/contract/params.ts#ResyncFromStoryParams",
    ],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/character/contract/avatar-link.ts#CharacterAvatarLinkContext",
    distinctFrom: ["packages/server/src/domain/world-info/contract/import.ts#WorldInfoDuplicateCarryContext"],
    reason: "Each domain's own {db, now} persistence bundle; sharing it would need a sideways import.",
  },
  {
    shape: "packages/server/src/domain/character/contract/params.ts#RemoveCharacterParams",
    distinctFrom: [
      "packages/contracts/src/character/index.ts#DuplicateCharacterParams",
      "packages/contracts/src/character/index.ts#GetCardParams",
      "packages/contracts/src/character/index.ts#GetCharacterParams",
      "packages/server/src/domain/persona/contract/params.ts#ListConnectedParams",
      "packages/server/src/domain/regex/contract/params.ts#ListForCharacterParams",
      "packages/server/src/domain/world-info/contract/params.ts#ListForCharacterParams",
    ],
    reason: "A verb input over its own actor type; the characterId look-alikes are other verbs and other actor types.",
  },
  {
    shape: "packages/server/src/domain/character/contract/params.ts#ListSnapshotsParams",
    distinctFrom: [
      "packages/contracts/src/character/index.ts#DuplicateCharacterParams",
      "packages/contracts/src/character/index.ts#GetCardParams",
      "packages/contracts/src/character/index.ts#GetCharacterParams",
      "packages/server/src/domain/persona/contract/params.ts#ListConnectedParams",
      "packages/server/src/domain/regex/contract/params.ts#ListForCharacterParams",
      "packages/server/src/domain/world-info/contract/params.ts#ListForCharacterParams",
    ],
    reason: "A verb input over its own actor type; the characterId look-alikes are other verbs and other actor types.",
  },
  {
    shape: "packages/server/src/domain/chat/contract/context.ts#ExtractQuietResult",
    distinctFrom: ["packages/contracts/src/character/index.ts#GeneratedGreeting"],
    reason: "Chat's quiet extraction result for imagery and character's greeting result: different producers.",
  },
  {
    shape: "packages/server/src/domain/chat/contract/engine-context.ts#ReserveReceiptEventsOp",
    distinctFrom: ["packages/inference/src/contract/local-light.ts#activation", "packages/server/src/domain/rpg/contract/service.ts#randomInt"],
    reason: "Number-in, number-out functions with unrelated meanings; no flow.",
  },
  {
    shape: "packages/server/src/domain/chat/contract/params.ts#RemoveCharacterFromChatParams",
    distinctFrom: ["packages/contracts/src/chat/seat-ops.ts#AddCharacterToChatParams"],
    reason: "The remove and add roster verbs' inputs: two verbs, not one concept.",
  },
  {
    shape: "packages/server/src/domain/chat/contract/signup.ts#HashTokenOp",
    distinctFrom: [
      "packages/kit/src/content/index.ts#push",
      "packages/kit/src/ids/index.ts#RawIdGenerator",
      "packages/kit/src/macro/engine.ts#postProcess",
      "packages/kit/src/macro/types.ts#evaluateString",
      "packages/kit/src/macro/types.ts#postProcess",
      "packages/server/src/domain/chat/assembly/shape.ts#resolveContent",
      "packages/server/src/domain/sessions/contract/service.ts#hashPendingSecret",
      "packages/server/src/foundation/env/record/index.ts#readFile",
      "packages/server/src/infra/auth/contract.ts#add",
    ],
    reason: "Chat's invite-token hasher; the matches are unrelated string functions, and the pending-join hash has its own key.",
  },
  {
    shape: "packages/server/src/domain/databank/contract/params.ts#ListActiveForChatParams",
    distinctFrom: [
      "packages/contracts/src/automation/index.ts#ListRulesParams",
      "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams",
      "packages/server/src/domain/regex/contract/params.ts#ListForChatParams",
      "packages/server/src/domain/regex/contract/params.ts#ListRoomDisplayScriptsParams",
      "packages/server/src/domain/rpg/contract/params.ts#DetachDanglingPointerParams",
      "packages/server/src/domain/rpg/contract/params.ts#ListCheckpointsParams",
      "packages/server/src/domain/rpg/contract/params.ts#ReadGameParams",
      "packages/server/src/domain/rpg/contract/params.ts#ResyncFromStoryParams",
    ],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/embeddings/contract/service.ts#EmbeddingsIndexerSubscription",
    distinctFrom: ["packages/server/src/domain/chat/contract/room-reach.ts#fanEntityEvent"],
    reason: "Embeddings' bus subscriber and chat's room-reach fan-out: different roles on one bus, neither feeds the other.",
  },
  {
    shape: "packages/server/src/domain/persona/contract/params.ts#GetPersonaParams",
    distinctFrom: ["packages/server/src/domain/world-info/contract/params.ts#ListForPersonaParams"],
    reason: "Each persona verb owns its params over PersonaActorParams; world-info's look-alike extends another actor type.",
  },
  {
    shape: "packages/server/src/domain/persona/contract/params.ts#RemovePersonaParams",
    distinctFrom: ["packages/server/src/domain/world-info/contract/params.ts#ListForPersonaParams"],
    reason: "Each persona verb owns its params over PersonaActorParams; world-info's look-alike extends another actor type.",
  },
  {
    shape: "packages/server/src/domain/persona/contract/params.ts#ListConnectedParams",
    distinctFrom: [
      "packages/contracts/src/character/index.ts#DuplicateCharacterParams",
      "packages/contracts/src/character/index.ts#GetCardParams",
      "packages/contracts/src/character/index.ts#GetCharacterParams",
      "packages/server/src/domain/regex/contract/params.ts#ListForCharacterParams",
      "packages/server/src/domain/world-info/contract/params.ts#ListForCharacterParams",
    ],
    reason: "A verb input over its own actor type; the characterId look-alikes are other verbs and other actor types.",
  },
  {
    shape: "packages/server/src/domain/persona/contract/params.ts#ListConnectedCharactersParams",
    distinctFrom: ["packages/server/src/domain/world-info/contract/params.ts#ListForPersonaParams"],
    reason: "Each persona verb owns its params over PersonaActorParams; world-info's look-alike extends another actor type.",
  },
  {
    shape: "packages/server/src/domain/persona/contract/params.ts#DuplicatePersonaParams",
    distinctFrom: ["packages/server/src/domain/world-info/contract/params.ts#ListForPersonaParams"],
    reason: "Each persona verb owns its params over PersonaActorParams; world-info's look-alike extends another actor type.",
  },
  {
    shape: "packages/server/src/domain/plugin/contract/ops.ts#PluginInvocationWork",
    distinctFrom: ["packages/server/src/domain/share/contract/service.ts#CertificateTransitions"],
    reason: "Plugin invocation accounting and ACME certificate transitions share only run<T> and AsyncDisposable.",
  },
  {
    shape: "packages/server/src/domain/plugin/contract/ops.ts#VoidPluginSuggestions",
    distinctFrom: ["packages/server/src/domain/plugin/contract/service.ts#clearForPlugin"],
    reason: "It voids the suggestion store's asks; each clearForPlugin clears another store.",
  },
  {
    shape: "packages/server/src/domain/regex/contract/params.ts#ListForCharacterParams",
    distinctFrom: [
      "packages/contracts/src/character/index.ts#DuplicateCharacterParams",
      "packages/contracts/src/character/index.ts#GetCardParams",
      "packages/contracts/src/character/index.ts#GetCharacterParams",
      "packages/server/src/domain/world-info/contract/params.ts#ListForCharacterParams",
    ],
    reason: "A verb input over its own actor type; the characterId look-alikes are other verbs and other actor types.",
  },
  {
    shape: "packages/server/src/domain/regex/contract/params.ts#ListForChatParams",
    distinctFrom: [
      "packages/contracts/src/automation/index.ts#ListRulesParams",
      "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams",
      "packages/server/src/domain/rpg/contract/params.ts#DetachDanglingPointerParams",
      "packages/server/src/domain/rpg/contract/params.ts#ListCheckpointsParams",
      "packages/server/src/domain/rpg/contract/params.ts#ReadGameParams",
      "packages/server/src/domain/rpg/contract/params.ts#ResyncFromStoryParams",
    ],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/regex/contract/params.ts#ListRoomDisplayScriptsParams",
    distinctFrom: [
      "packages/contracts/src/automation/index.ts#ListRulesParams",
      "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams",
      "packages/server/src/domain/rpg/contract/params.ts#DetachDanglingPointerParams",
      "packages/server/src/domain/rpg/contract/params.ts#ListCheckpointsParams",
      "packages/server/src/domain/rpg/contract/params.ts#ReadGameParams",
      "packages/server/src/domain/rpg/contract/params.ts#ResyncFromStoryParams",
    ],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/rpg/contract/params.ts#ListCheckpointsParams",
    distinctFrom: ["packages/contracts/src/automation/index.ts#ListRulesParams", "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams"],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/rpg/contract/params.ts#ReadGameParams",
    distinctFrom: ["packages/contracts/src/automation/index.ts#ListRulesParams", "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams"],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/rpg/contract/params.ts#DetachDanglingPointerParams",
    distinctFrom: ["packages/contracts/src/automation/index.ts#ListRulesParams", "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams"],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/rpg/contract/params.ts#ResyncFromStoryParams",
    distinctFrom: ["packages/contracts/src/automation/index.ts#ListRulesParams", "packages/contracts/src/chat/owner-ops.ts#ChatScopedParams"],
    reason: "A shape-only {principal, chatId} look-alike: each verb owns its params, and no flow links them.",
  },
  {
    shape: "packages/server/src/domain/settings/contract/params.ts#ImportThemeFileParams",
    distinctFrom: ["packages/server/src/domain/world-info/contract/params.ts#ImportBookFileParams"],
    reason: "Theme import and book import params over different actor types and entities.",
  },
  {
    shape: "packages/server/src/domain/world-info/contract/params.ts#ListForCharacterParams",
    distinctFrom: [
      "packages/contracts/src/character/index.ts#DuplicateCharacterParams",
      "packages/contracts/src/character/index.ts#GetCardParams",
      "packages/contracts/src/character/index.ts#GetCharacterParams",
    ],
    reason: "A verb input over its own actor type; the characterId look-alikes are other verbs and other actor types.",
  },
  {
    shape: "packages/server/src/entry/boot/backfill-plugin-provenance.ts#BackfillPluginProvenanceOnBootDeps",
    distinctFrom: [
      "packages/server/src/entry/boot/heal-legacy-background-pins.ts#HealLegacyBackgroundPinsDeps",
      "packages/server/src/entry/boot/migrate-handoff-offer-vocab.ts#MigrateHandoffOfferVocabDeps",
      "packages/server/src/entry/boot/migrate-plugin-tool-wire-names.ts#MigratePluginToolWireNamesDeps",
      "packages/server/src/entry/boot/migrate-prose-slot-vocab.ts#MigrateProseSlotVocabDeps",
      "packages/server/src/entry/boot/repair-stale-join-seq.ts#RepairStaleJoinSeqDeps",
    ],
    reason: "Each boot task owns its {logger, db} deps; one shared shape would be a generic bag, not a concept.",
  },
  {
    shape: "packages/server/src/entry/boot/heal-legacy-background-pins.ts#HealLegacyBackgroundPinsDeps",
    distinctFrom: [
      "packages/server/src/entry/boot/migrate-handoff-offer-vocab.ts#MigrateHandoffOfferVocabDeps",
      "packages/server/src/entry/boot/migrate-plugin-tool-wire-names.ts#MigratePluginToolWireNamesDeps",
      "packages/server/src/entry/boot/migrate-prose-slot-vocab.ts#MigrateProseSlotVocabDeps",
      "packages/server/src/entry/boot/repair-stale-join-seq.ts#RepairStaleJoinSeqDeps",
    ],
    reason: "Each boot task owns its {logger, db} deps; one shared shape would be a generic bag, not a concept.",
  },
  {
    shape: "packages/server/src/entry/boot/migrate-handoff-offer-vocab.ts#MigrateHandoffOfferVocabDeps",
    distinctFrom: [
      "packages/server/src/entry/boot/migrate-plugin-tool-wire-names.ts#MigratePluginToolWireNamesDeps",
      "packages/server/src/entry/boot/migrate-prose-slot-vocab.ts#MigrateProseSlotVocabDeps",
      "packages/server/src/entry/boot/repair-stale-join-seq.ts#RepairStaleJoinSeqDeps",
    ],
    reason: "Each boot task owns its {logger, db} deps; one shared shape would be a generic bag, not a concept.",
  },
  {
    shape: "packages/server/src/entry/boot/migrate-plugin-tool-wire-names.ts#MigratePluginToolWireNamesDeps",
    distinctFrom: [
      "packages/server/src/entry/boot/migrate-prose-slot-vocab.ts#MigrateProseSlotVocabDeps",
      "packages/server/src/entry/boot/repair-stale-join-seq.ts#RepairStaleJoinSeqDeps",
    ],
    reason: "Each boot task owns its {logger, db} deps; one shared shape would be a generic bag, not a concept.",
  },
  {
    shape: "packages/server/src/entry/boot/migrate-prose-slot-vocab.ts#MigrateProseSlotVocabDeps",
    distinctFrom: ["packages/server/src/entry/boot/repair-stale-join-seq.ts#RepairStaleJoinSeqDeps"],
    reason: "Each boot task owns its {logger, db} deps; one shared shape would be a generic bag, not a concept.",
  },
  {
    shape: "packages/server/src/infra/auth/contract.ts#OidcDiscover",
    distinctFrom: ["packages/server/src/entry/http/auth-routes.ts#getConfig"],
    reason: "The raw issuer discovery and its cached single-flight product: a producer and its decoration, different lifetimes.",
  },
  {
    shape: "packages/ui/src/layout/toolbar.tsx#ToolbarSeparatorProps",
    distinctFrom: ["packages/ui/src/primitives/menu/menu.tsx#MenuSeparatorProps"],
    reason: "Each wraps its own Base UI separator, so its props follow its own base type.",
  },
  {
    shape: "packages/ui/src/primitives/alert-dialog/alert-dialog.tsx#AlertDialogTitleProps",
    distinctFrom: ["packages/ui/src/primitives/dialog/dialog.tsx#DialogTitleProps"],
    reason: "The alert dialog and dialog primitives each follow their own base part.",
  },
  {
    shape: "packages/ui/src/primitives/alert-dialog/alert-dialog.tsx#AlertDialogDescriptionProps",
    distinctFrom: ["packages/ui/src/primitives/dialog/dialog.tsx#DialogDescriptionProps"],
    reason: "The alert dialog and dialog primitives each follow their own base part.",
  },
  {
    shape: "packages/ui/src/primitives/autocomplete/autocomplete.tsx#AutocompleteGroup",
    distinctFrom: ["packages/ui/src/primitives/combobox/combobox.tsx#ComboboxGroup"],
    reason: "Each primitive's own public group type; one shared group type is a ui design call, not a census merge.",
  },
  {
    shape: "packages/ui/src/primitives/message-list/pin-spacer.ts#PinnedSpan",
    distinctFrom: ["packages/kit/src/chunk/split.ts#Span", "packages/kit/src/content/index.ts#HiddenRun"],
    reason: "Virtual-window offsets, the chunker's character spans and hidden tag runs: different concepts sharing {start, end}.",
  },
  {
    shape: "packages/ui/src/stream/shimmer.tsx#StreamShimmerProps",
    distinctFrom: ["packages/ui/src/stream/typing-dots.tsx#TypingDotsProps"],
    reason: "Two stream components with {label, className?}; neither renders the other.",
  },
] as const satisfies readonly DistinctLookalike[];

/** The registry `pnpm unwired ports` judges look-alikes against; a test passes its own. */
export type DistinctRegistry = readonly DistinctLookalike[];

/** Whether `a` and `b` are recorded distinct, from either side. */
export function isDistinctPair(registry: DistinctRegistry, a: string, b: string): boolean {
  const lists = (shape: string, other: string): boolean => registry.some((entry) => entry.shape === shape && entry.distinctFrom.some((ref) => ref === other));
  return lists(a, b) || lists(b, a);
}
