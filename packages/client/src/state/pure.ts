// state/ PURE-LOGIC front door (#1243). HAND-MAINTAINED mirror of a state/index.ts subset — NO enforcer
// keeps it complete. #1262 (2026-09-03) measured its stated reasons (DOM-crash risk, type-graph
// isolation, import cost) against the real tree and refuted all three — receipts on issue #1262.

export { setAnalyticsSearchQuery, useAnalyticsSearchQuery } from "./analytics-search-store.ts";
export {
  analyticsSectionSelection,
  clearAnalyticsSelection,
  selectAnalyticsCharacter,
  useSelectedAnalyticsCharacterId,
} from "./analytics-selection-store.ts";
export type { AssembleChromeInput } from "./assemble-chrome.ts";
export { assembleChrome } from "./assemble-chrome.ts";
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
export type { ChromeEntry, ChromeEntryBehavior, ChromePresentation, ChromeZone, MobileCuration } from "./chrome-registry.ts";
export { CHROME_ZONES, mobileBarCuration, sheetOverflowChrome } from "./chrome-registry.ts";
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
export { CONFIG_GROUP_IDS, CONFIG_SHELVES, isConfigGroupId, isConfigShelf } from "./config-group-ids.ts";
export { __resetConfigGroupOpen, openConfigGroup, toggleConfigGroup, useConfigGroupOpen } from "./config-group-open-store.ts";
export type { ConfigLinkTarget } from "./config-link.ts";
export { formatConfigLink, parseConfigLink } from "./config-link.ts";
export type { ConfigTarget, ConfigVisibleSetting } from "./config-nav-store.ts";
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
export type { ConfigModifiedMap, ConfigSearchMatch, ModifiedSettingIds, ModifiedSubIds } from "./config-search-store.ts";
export {
  __resetConfigSearch,
  clearConfigSearch,
  setConfigSearchMatch,
  setConfigSearchQuery,
  useConfigSearchMatch,
  useConfigSearchQuery,
} from "./config-search-store.ts";
// `ResolvedConfigSection` is deliberately absent: no importer outside `state/` reads it by name (#978).
// The bare context rides out beside the throwing hook for the SANCTIONED nullable read (`use(Context)`,
// create-registry-context.tsx's own carve-out) — `useConfigLeaf` stays inert without a provider.
export {
  clearCollectionSelection,
  collectionMemberSelection,
  selectCollectionMember,
  selectCollectionMemberFromList,
  useCollectionSelection,
} from "./config-selection-store.ts";
export {
  compareCorpusPair,
  setCorpusCompareA,
  setCorpusCompareB,
  useCorpusCompareA,
  useCorpusCompareAName,
  useCorpusCompareB,
  useCorpusCompareBName,
} from "./corpus-compare-store.ts";
export { setCorpusSearchQuery, setCorpusSearchTarget, useCorpusSearchQuery, useCorpusSearchTargetId } from "./corpus-search-store.ts";
export {
  clearCorpusSelection,
  corpusSectionSelection,
  selectCorpusCharacter,
  useSelectedCorpusCharacterId,
} from "./corpus-selection-store.ts";
export type { DrillSelectionStore, PrimaryDrillStore } from "./create-drill-selection-store.ts";
export { createDrillSelectionStore } from "./create-drill-selection-store.ts";
export type { EntityDraftStore, EntityDraftStoreConfig } from "./create-entity-draft-store.ts";
export { createEntityDraftStore } from "./create-entity-draft-store.ts";
export type { KindedDrillStore, KindedSelection } from "./create-kinded-selection-store.ts";
export { createKindedSelectionStore } from "./create-kinded-selection-store.ts";
export type { PersistedStoreOptions } from "./create-persisted-store.ts";
export { createPersistedStore } from "./create-persisted-store.ts";
// `IngestPhase`/`INGEST_PHASES` are NOT re-exported here any more: the axis became a `databank.list` INPUT
// (owner ruling 2026-08-13), so its home is `@orb/contracts/databank` and every consumer reads it from there.
export { clearDatabankPhaseFilter, setDatabankPhaseFilter, useDatabankPhaseFilter } from "./databank-filter-store.ts";
export { clearDocumentSelection, databankSectionSelection, selectDocumentFromList, useSelectedDocumentId } from "./databank-selection-store.ts";
// `draft-config-store.ts` was DELETED 2026-08-14 (chat-creation-draft-mode-replacement.md §4.9): it held a
// whole second config model — greetings, roster overrides, group config, room overrides, injections,
// startAsGame — for a room that had no server row. The room has a row from the creation click, so every one
// of those is now the COMMITTED verb it always shadowed.
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
export {
  GAME_MODE_KEPT_LINE,
  GAME_MODE_OFF_ANNOUNCEMENT,
  GAME_MODE_OFF_KICKER,
  GAME_MODE_OFF_LABEL,
  GAME_MODE_ON_ANNOUNCEMENT,
  GAME_MODE_ON_LABEL,
  GAME_MODE_RESUME_LABEL,
  onGameModeStarted,
  onGameModeStopped,
} from "./game-mode-transition.ts";
export type { DormantDoorway, HomeTileContribution, HomeTileRegion } from "./home-tile-contracts.ts";
export { HOME_TILE_REGIONS } from "./home-tile-contracts.ts";
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
export type { ListFlipCarry } from "./list-flip-carry.ts";
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
export type {
  ModalDefinition,
  ModalTrigger,
  ModalTriggerPlacement,
} from "./modal-registry.ts";
export { MODAL_TRIGGER_PLACEMENTS } from "./modal-registry.ts";
export type { ModalSlotId } from "./modal-slot-ids.ts";
export { MODAL_SLOT_IDS } from "./modal-slot-ids.ts";
export { publishNoticeBand, useNoticeBand } from "./notice-band-store.ts";
export type { OverlayPanelRequest, PanelMode, PanelName } from "./panel-resolve.ts";
export { PANEL_MODES, resolvePanelMode } from "./panel-resolve.ts";
export type { PluginCommandArgsSubject } from "./plugin-command-args-store.ts";
export {
  __readPluginCommandArgsSubjectForTest,
  __resetPluginCommandArgs,
  clearPluginCommandArgs,
  openPluginCommandArgs,
  usePluginCommandArgsSubject,
} from "./plugin-command-args-store.ts";
export type { PluginDialogSubject } from "./plugin-dialog-store.ts";
export { __readPluginDialogSubjectForTest, __resetPluginDialog, clearPluginDialog, openPluginDialog, usePluginDialogSubject } from "./plugin-dialog-store.ts";
export type { PluginPageKey } from "./plugin-page-selection-store.ts";
export {
  clearPluginPage,
  parsePluginPageKey,
  pluginPageKey,
  pluginPageSectionSelection,
  selectPluginPage,
  selectPluginPageFromList,
  usePluginPageKey,
} from "./plugin-page-selection-store.ts";
export { setPresetEditorView, usePresetEditorView } from "./preset-editor-view-store.ts";
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
  clearRefinerySelection,
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
export type { SectionId } from "./section-ids.ts";
export { isSectionId, RETIRED_SECTION_HEAL, resolveSectionPath, SECTION_IDS } from "./section-ids.ts";
export { LIST_OFF_SCREEN_HINT, useSectionListIsScreen, useSectionListMode } from "./section-list-projection.ts";
export type { SaveLifecycleState } from "./settings-save-status-store.ts";
export {
  clearSectionSaveStatus,
  reportSectionSaveStatus,
  SAVE_LIFECYCLE_STATES,
  useAggregateSaveStatus,
  useBlockedSaveSections,
  useErroredSaveSections,
} from "./settings-save-status-store.ts";
export { announceStatus, useStatusAnnouncement } from "./status-announcement-store.ts";
export {
  __readRecentSteersForTest,
  __resetRecentSteers,
  pushFiredSteer,
  STEER_RECOVERY_CAP,
  useRecentSteers,
} from "./steer-recovery-store.ts";
export { __readSurfaceBoxForTest, __resetSurfaceBoxes, rememberSurfaceBox, useSurfaceBox } from "./surface-box-store.ts";
export { clearWorldEntrySelection, selectWorldEntry, useSelectedWorldEntryId } from "./world-entry-selection-store.ts";
