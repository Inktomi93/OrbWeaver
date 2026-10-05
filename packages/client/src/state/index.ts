// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server state NEVER lives here
// (TanStack Query owns it); these are the transient/device-local concerns. Store minting has THREE doors, all
// devtools-instrumented + action-labeled: `createGatedStore` (hook-shaped singletons), `createEntityDraftStore` (persist-shaped,
// per-entity vanilla factories), and `createPersistedStore` (hook-shaped singletons that persist to storage).

export type { NewChatIntent } from "./active-chat-store.ts";
export {
  __migrateActiveChatForTest,
  activeChatId,
  chatDeletedFromList,
  chatSectionSelection,
  clearNewChatIntent,
  clearRoomInvite,
  enterCreatedChat,
  goToLanding,
  openChatMoment,
  openNewChatPicker,
  openRoomInvite,
  resumeChat,
  selectChat,
  selectChatFromList,
  subscribeHuskAbandoned,
  useActiveChatHandle,
  useActiveChatId,
  useNewChatIntent,
  useRoomInviteRequest,
} from "./active-chat-store.ts";
export { setAnalyticsSearchQuery, useAnalyticsSearchQuery } from "./analytics-search-store.ts";
export { clearAnalyticsSelection, selectAnalyticsCharacterFromList, useSelectedAnalyticsCharacterId } from "./analytics-selection-store.ts";
export type { SeedThemeName } from "./appearance-boot-hint.ts";
export {
  __resetAppearanceBootHint,
  DATA_THEME_ATTR,
  FONT_SCALE_VAR,
  REDUCED_MOTION_ATTR,
  rememberAppearanceBootHint,
  rememberDataThemeHint,
  useAppearanceBootHint,
} from "./appearance-boot-hint.ts";
export { assembleChrome } from "./assemble-chrome.ts";
export { closeCharacterGallery, openCharacterGallery, useCharacterGalleryTarget } from "./character-gallery-store.ts";
export {
  __resetTagFilter,
  clearCharacterFilters,
  cycleTagFilter,
  setBulkMode,
  setCharacterSearch,
  setCharacterSortMode,
  setCharacterViewMode,
  toggleFavoritesOnly,
  toggleFiltersOpen,
  toggleShowArchived,
  toggleSpoilerBlur,
  useCharacterBulkMode,
  useCharacterSearch,
  useCharacterSortMode,
  useCharacterViewMode,
  useFavoritesOnly,
  useFiltersOpen,
  useShowArchived,
  useSpoilerBlur,
  useTagFilter,
} from "./character-library-store.ts";
export {
  characterSectionSelection,
  clearCharacterFacet,
  clearCharacterSelection,
  selectCharacter,
  selectCharacterFacet,
  useSelectedCharacterFacetId,
  useSelectedCharacterId,
} from "./character-selection-store.ts";
export { __resetChatContextSections, setChatContextSectionOpen, useChatContextSectionOpen } from "./chat-context-section-open-store.ts";
export type { ActiveChatHandle, ChatHandle } from "./chat-handle.ts";
export { committedChat, isCommitted, isLanding, landingChat } from "./chat-handle.ts";
export type { ChatListCharacterFilter } from "./chat-list-filter-store.ts";
export {
  clearChatListCharacterFilter,
  setChatListCharacterFilter,
  setChatListMonth,
  setChatListSearch,
  useChatListCharacterFilter,
  useChatListMonth,
  useChatListSearch,
} from "./chat-list-filter-store.ts";
export { clearChatMoment, consumeChatMoment, requestChatMoment, useChatMoment } from "./chat-moment-store.ts";
export type { ChatStreamApi, RecallState, TurnSlot } from "./chat-stream.ts";
export {
  __setFrameSchedulerForTest,
  chatStream,
  isLiveTurnPhase,
  subscribeTurnSlot,
  subscribeUserMessageCommitted,
  useRecallState,
  useSwipeTargetMessageId,
  useTurnCommittedMessageId,
  useTurnPhase,
  useTurnSlot,
  useTurnSpeakerCharacterId,
} from "./chat-stream.ts";
export type { ChromeEntry, ChromeEntryBehavior, ChromePresentation, ChromeZone, MobileCuration } from "./chrome-registry.ts";
export { CHROME_ZONES, mobileBarCuration, sheetOverflowChrome } from "./chrome-registry.ts";
export type { ChromeRegistry } from "./chrome-registry-context.ts";
export { useChromeRegistry } from "./chrome-registry-context.ts";
export { ChromeRegistryProvider } from "./chrome-registry-provider.tsx";
export { CommandPaletteSourceRegistryContext } from "./command-palette-source-registry-context.ts";
export { CommandPaletteSourceRegistryProvider } from "./command-palette-source-registry-provider.tsx";
export {
  __readComposerDraftsForTest,
  __resetComposerDrafts,
  COMPOSER_DRAFT_CAP,
  readComposerDraft,
  setComposerDraft,
  useComposerDraft,
} from "./composer-draft-store.ts";
export { requestComposerFocus, useComposerFocusRequest } from "./composer-focus-store.ts";
export type { ConfigFocus } from "./config-focus-store.ts";
export { __resetConfigFocus, clearConfigFocus, setConfigFocus, useConfigFocus } from "./config-focus-store.ts";
export type { ConfigGroupId, ConfigShelf } from "./config-group-ids.ts";
export { CONFIG_GROUP_IDS, CONFIG_SHELVES, isConfigGroupId, MULTI_USER_CONFIG_SUB } from "./config-group-ids.ts";
export { __resetConfigGroupOpen, closeConfigGroup, openConfigGroup, useConfigGroupOpen } from "./config-group-open-store.ts";
export type {
  CollectionGroupDefinition,
  ConfigGroupBase,
  ConfigGroupBody,
  ConfigGroupDefinition,
  ConfigGroupRegistry,
  ConfigSearchRow,
  ConfigSettingLeaf,
  ConfigSettingRef,
  ConfigSubcategory,
  SettingsViewerView,
  SettingTeach,
  SettingTeachDecl,
} from "./config-group-registry.ts";
export { configAnchorId, configSettingControlId, isCollectionGroup, isPlaceholderGroup, isTeachNone, rendersOwnBody } from "./config-group-registry.ts";
export { formatConfigLink, parseConfigLink } from "./config-link.ts";
export type { ConfigVisibleSetting } from "./config-nav-store.ts";
export {
  __resetConfigNav,
  clearActiveConfigGroup,
  getActiveConfigGroup,
  openConfigTo,
  selectConfigGroup,
  selectConfigSub,
  setActiveConfigSub,
  subscribeConfigNav,
  useActiveConfigGroup,
  useActiveConfigSub,
  useConfigTarget,
  useVisibleConfigSettings,
} from "./config-nav-store.ts";
export type { ConfigRowAnnotation } from "./config-row-annotation.ts";
export { ConfigRowAnnotationProvider, useConfigRowAnnotation } from "./config-row-annotation.ts";
export type { ConfigModifiedMap } from "./config-search-store.ts";
export {
  __resetConfigSearch,
  setConfigSearchMatch,
  setConfigSearchQuery,
  useConfigSearchMatch,
  useConfigSearchQuery,
} from "./config-search-store.ts";
export { assertSettingsKeyPartition, UNCLAIMED_SETTINGS_KEYS } from "./config-section-partition.ts";
// `ResolvedConfigSection` is deliberately absent: no importer outside `state/` reads it by name (#978).
export type { ConfigSectionContribution, ConfigSectionPartition, SettingsKeyClaim } from "./config-section-registry.ts";
export { configSectionNavParts, configSectionNavs, resolveConfigSections } from "./config-section-registry.ts";
export type { ConfigSectionRegistry } from "./config-section-registry-context.ts";
// The bare context rides out beside the throwing hook for the SANCTIONED nullable read (`use(Context)`,
// create-registry-context.tsx's own carve-out) — `useConfigLeaf` stays inert without a provider.
export { configSectionRegistryContext, useConfigSectionRegistry, useConfigSections } from "./config-section-registry-context.ts";
export { ConfigSectionRegistryProvider } from "./config-section-registry-provider.tsx";
export {
  clearCollectionSelection,
  collectionMemberSelection,
  selectCollectionMember,
  selectCollectionMemberFromList,
  useCollectionSelection,
} from "./config-selection-store.ts";
export { assertTeachHonesty } from "./config-teach.ts";
export { clearConnectionEditorRequest, requestConnectionEditor, useRequestedConnectionEditor } from "./connection-editor-request-store.ts";
export {
  compareCorpusPair,
  setCorpusCompareA,
  setCorpusCompareB,
  useCorpusCompareA,
  useCorpusCompareAName,
  useCorpusCompareB,
  useCorpusCompareBName,
} from "./corpus-compare-store.ts";
export { healCorpusModeFrom, useCorpusMode } from "./corpus-mode-store.ts";
export {
  readCorpusResultScroll,
  setCorpusResultScroll,
  setCorpusSearchQuery,
  setCorpusSearchTarget,
  useCorpusSearchQuery,
  useCorpusSearchTargetId,
} from "./corpus-search-store.ts";
export {
  clearCorpusSelection,
  corpusSectionSelection,
  revealCorpusOverview,
  selectCorpusArtifact,
  selectCorpusCharacter,
  setCorpusMode,
  useSelectedCorpusCharacterId,
  useSelectedCorpusDestination,
} from "./corpus-selection-store.ts";
export type { DrillSelectionStore, PrimaryDrillStore } from "./create-drill-selection-store.ts";
export { createDrillSelectionStore } from "./create-drill-selection-store.ts";
export type { EntityDraftStore } from "./create-entity-draft-store.ts";
export { createEntityDraftStore } from "./create-entity-draft-store.ts";
export type { GatedSet, GatedStoreHook } from "./create-gated-store.ts";
export { createGatedStore, STORE_DEVTOOLS_ENABLED } from "./create-gated-store.ts";
export type { KindedSelection } from "./create-kinded-selection-store.ts";
export { createKindedSelectionStore } from "./create-kinded-selection-store.ts";
export type { PersistedStoreOptions } from "./create-persisted-store.ts";
export { createPersistedStore } from "./create-persisted-store.ts";
// `IngestPhase`/`INGEST_PHASES` are a `databank.list` input homed in `@orb/contracts/databank`; never re-export them here.
export { clearDatabankPhaseFilter, setDatabankPhaseFilter, useDatabankPhaseFilter } from "./databank-filter-store.ts";
export { clearDocumentSelection, databankSectionSelection, selectDocumentFromList, useSelectedDocumentId } from "./databank-selection-store.ts";
export { __resetDeploymentBootHint, rememberMultiHumanCapable, useMultiHumanCapableHint } from "./deployment-boot-hint.ts";
// D166: room configuration belongs to committed server verbs, not a second local draft model.
export type { DurableLocalPersistApi, DurableLocalStorage } from "./durable-local.ts";
export {
  __resetDurableLocal,
  activeDurableLocalUserId,
  bindDurableLocalToUser,
  durableLocalKey,
  durableLocalReadyFor,
  durableLocalWritesAllowed,
  registerDurableLocalStore,
} from "./durable-local.ts";
export { setExtensionsSearchQuery, useExtensionsSearchQuery } from "./extensions-search-store.ts";
export {
  GAME_MODE_KEPT_LINE,
  GAME_MODE_OFF_KICKER,
  GAME_MODE_OFF_LABEL,
  GAME_MODE_ON_LABEL,
  GAME_MODE_RESUME_LABEL,
  onGameModeStarted,
  onGameModeStopped,
} from "./game-mode-transition.ts";
export type { DormantDoorway, HomeTileContribution, HomeTileRegion } from "./home-tile-contracts.ts";
export {
  readRememberedFootPaired,
  rememberHomeFootPaired,
  rememberHomeRegion,
  rememberHomeTileSettledHidden,
  useHomeTileSettledHidden,
  useRememberedHomeRegion,
} from "./home-tile-memory-store.ts";
export type { ImageSubject, ImagineSeed } from "./imagery-store.ts";
export {
  __readImageryIntentForTest,
  __resetImageryIntent,
  clearDetailSubject,
  clearEditSubject,
  clearImagineSeed,
  openImageDetail,
  openImageEdit,
  openImagine,
  useDetailSubject,
  useEditSubject,
  useImagineSeed,
} from "./imagery-store.ts";
export { setLabelNameFocus, useLabelNameFocus } from "./label-name-focus-store.ts";
export { clearLabelSelection, labelDeleted, selectLabel, selectLabelFromList, useSelectedLabelId } from "./label-selection-store.ts";
export { collapseListPanel, dockListPanel, registerListFlipCarry } from "./list-flip-carry.ts";
export {
  __readMessageEditDraftForTest,
  cancelEditingMessage,
  setMessageEditDraft,
  startEditingMessage,
  useIsEditingMessage,
  useMessageEditDraftText,
  useMessageEditReservedInlineSize,
} from "./message-edit-draft.ts";
export {
  __resetSelection,
  enterSelectionMode,
  exitSelectionMode,
  readSelectedMessageIds,
  toggleMessageSelected,
  useIsMessageSelected,
  useSelectedCount,
  useSelectionActive,
} from "./message-selection-store.ts";
export { MessageToolsRendererRegistryContext } from "./message-tools-renderer-registry-context.ts";
export { MessageToolsRendererRegistryProvider } from "./message-tools-renderer-registry-provider.tsx";
export type { ModalDefinition } from "./modal-registry.ts";
export type { ModalRegistry } from "./modal-registry-context.ts";
export { useModalRegistry } from "./modal-registry-context.ts";
export { ModalRegistryProvider } from "./modal-registry-provider.tsx";
export type { ModalSlotId } from "./modal-slot-ids.ts";
export { MODAL_SLOT_IDS } from "./modal-slot-ids.ts";
export type { OverlayPanelRequest, PanelMode, PanelName } from "./panel-resolve.ts";
export { resolvePanelMode } from "./panel-resolve.ts";
export { openPersonaEditor, selectPersonaEditor, usePersonaEditorId } from "./persona-editor-selection-store.ts";
export {
  __readPluginCommandArgsSubjectForTest,
  __resetPluginCommandArgs,
  clearPluginCommandArgs,
  openPluginCommandArgs,
  usePluginCommandArgsSubject,
} from "./plugin-command-args-store.ts";
export { __readPluginDialogSubjectForTest, __resetPluginDialog, clearPluginDialog, openPluginDialog, usePluginDialogSubject } from "./plugin-dialog-store.ts";
export type { PluginPageKey } from "./plugin-page-selection-store.ts";
export {
  clearPluginPage,
  pluginPageKey,
  pluginPageSectionSelection,
  selectPluginPageFromList,
  usePluginPageKey,
} from "./plugin-page-selection-store.ts";
export { setPresetEditorView, setPresetReadoutTarget, usePresetEditorView, usePresetReadoutTarget } from "./preset-editor-view-store.ts";
export { setPresetSearchQuery, usePresetSearchQuery } from "./preset-search-store.ts";
export {
  closePresetSectionDrill,
  drillPresetSection,
  retargetPresetSectionDrill,
  useDrilledPresetSectionId,
} from "./preset-section-drill-store.ts";
export {
  __dismissPresetSectionForTest,
  __resetPresetSection,
  __resetPresetSelection,
  getSelectedPresetId,
  presetSectionSelection,
  selectPreset,
  selectPresetFromList,
  selectPresetSection,
  useSelectedPresetId,
  useSelectedPresetSectionId,
} from "./preset-selection-store.ts";
export {
  __resetPresetTemplate,
  closePresetTemplateDrill,
  drillPresetTemplate,
  selectPresetTemplate,
  useDrilledPresetTemplateId,
  useSelectedPresetTemplateId,
} from "./preset-template-selection-store.ts";
export {
  __readRecentModelsForTest,
  __resetAllRecentModels,
  pushRecentModel,
  RECENT_MODELS_CAP,
  useRecentModels,
} from "./recent-models-store.ts";
export { requestRefineryLandingFocus, useRefineryLandingFocusRequest } from "./refinery-landing-focus-store.ts";
export {
  refinerySectionSelection,
  selectRefinerySession,
  selectRefinerySessionFromList,
  useSelectedRefinerySessionId,
} from "./refinery-selection-store.ts";
export type { RefineryWorkbenchDoor } from "./refinery-view-store.ts";
export {
  __peekRefineryViewForTest,
  clearRefineryWorkbenchDoor,
  requestRefineryWorkbenchDoor,
  setRefineryArmedRewrite,
  setRefineryViewedRun,
  useRefineryArmedRewriteId,
  useRefineryRequestedDoor,
  useRefineryViewedRunId,
} from "./refinery-view-store.ts";
export {
  __readRegexBulkForTest,
  clearRegexBulkSelection,
  exitRegexBulkMode,
  toggleRegexBulkMode,
  toggleRegexScriptSelected,
  useIsRegexScriptSelected,
  useRegexBulkActive,
  useRegexBulkSelectedIds,
} from "./regex-bulk-store.ts";
export { applyRpgRoundEvent, clearRpgRounds, readRpgRoundPendingForTest, useRpgRoundPending } from "./rpg-round-store.ts";
export type { RuleCreation } from "./rule-creation-store.ts";
export {
  acknowledgeRuleCreation,
  assertRuleDraftOwner,
  beginRuleCreation,
  clearRuleRecoveryCheckpoint,
  forgetRuleCreation,
  pruneCompletedRuleCreations,
  readRuleCreation,
  ruleDraftOwnerCurrent,
  useRuleCreations,
} from "./rule-creation-store.ts";
export type { SectionId } from "./section-ids.ts";
export { isSectionId, RETIRED_SECTION_HEAL, resolveSectionPath, SECTION_IDS } from "./section-ids.ts";
export { LIST_OFF_SCREEN_HINT, useSectionHasSelection, useSectionListIsScreen, useSectionListMode } from "./section-list-projection.ts";
export type {
  RailZone,
  SectionDefinition,
  SectionSelection,
} from "./section-registry.ts";
export { NO_SELECTION_TITLE, RAIL_ZONES, SECTION_GROUPS } from "./section-registry.ts";
export type { SectionRegistry } from "./section-registry-context.ts";
export { useSectionRegistry } from "./section-registry-context.ts";
export { SectionRegistryProvider } from "./section-registry-provider.tsx";
export type { SaveLifecycleState } from "./settings-save-status-store.ts";
export {
  clearSectionSaveStatus,
  reportSectionSaveStatus,
  SAVE_LIFECYCLE_STATES,
  useAggregateSaveStatus,
  useBlockedSaveSections,
  useErroredSaveSections,
} from "./settings-save-status-store.ts";
export type { PublishedContextTab } from "./shell-store.ts";
export {
  closeModal,
  getAvailableContextTabIds,
  getAvailableContextTabs,
  getContextTab,
  hideContextPanel,
  openModal,
  publishContextTabs,
  revealContextPanel,
  revealContextPanelBesideContent,
  setActiveSection,
  setContextTab,
  setFocusMode,
  setMobileViewport,
  setNarrowViewport,
  setOpenOverlayPanel,
  setPanelMode,
  subscribeShellState,
  useActiveSection,
  useContextTab,
  useFocusMode,
  useMobileViewport,
  useNarrowViewport,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  withContentSwap,
} from "./shell-store.ts";
export type { SlashCommandRegistry } from "./slash-command-registry-context.ts";
export { SlashCommandRegistryContext } from "./slash-command-registry-context.ts";
export { SlashCommandRegistryProvider } from "./slash-command-registry-provider.tsx";
export { announceStatus, useStatusAnnouncement } from "./status-announcement-store.ts";
export { __readRecentSteersForTest, __resetRecentSteers, pushFiredSteer, STEER_RECOVERY_CAP, useRecentSteers } from "./steer-recovery-store.ts";
export { __readSurfaceBoxForTest, __resetSurfaceBoxes, forgetSurfaceBox, rememberSurfaceBox, useSurfaceBox } from "./surface-box-store.ts";
export { setLabelFilter, setTagPruneConfirmOpen, setTagSortMode, useLabelFilter, useTagPruneConfirmOpen, useTagSortMode } from "./tag-library-store.ts";
export { clearWorldEntrySelection, selectWorldEntry, useSelectedWorldEntryId, worldEntrySelectionSeam } from "./world-entry-selection-store.ts";
