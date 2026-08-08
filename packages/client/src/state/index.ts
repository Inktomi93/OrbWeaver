// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.
// Store minting has THREE doors, all devtools-instrumented + action-labeled: `createGatedStore`
// (hook-shaped singletons), `createEntityDraftStore` (persist-shaped, per-entity vanilla factories),
// and `createPersistedStore` (hook-shaped singletons that persist to storage).

export type { DraftSeed } from "./active-chat-store.ts";
export {
  chatDeletedFromList,
  chatSectionSelection,
  clearNewChatPreset,
  commitDraft,
  goToLanding,
  openNewChatPicker,
  selectChat,
  selectChatFromList,
  startNewChat,
  useActiveChatHandle,
  useActiveChatId,
  useActiveDraftFoundingCast,
  useActiveDraftSeed,
  useActiveSessionKey,
  useNewChatPreset,
} from "./active-chat-store.ts";
export {
  analyticsSectionSelection,
  clearAnalyticsSelection,
  selectAnalyticsCharacter,
  useSelectedAnalyticsCharacterId,
} from "./analytics-selection-store.ts";
export type { AssembleChromeInput } from "./assemble-chrome.ts";
export { assembleChrome } from "./assemble-chrome.ts";
export type { CharacterViewMode } from "./character-library-store.ts";
export {
  __resetTagFilter,
  CHARACTER_VIEW_MODES,
  cycleTagFilter,
  setBulkMode,
  setCharacterSortMode,
  setCharacterViewMode,
  toggleFavoritesOnly,
  toggleShowArchived,
  toggleSpoilerBlur,
  useCharacterBulkMode,
  useCharacterSortMode,
  useCharacterViewMode,
  useFavoritesOnly,
  useShowArchived,
  useSpoilerBlur,
  useTagFilter,
} from "./character-library-store.ts";
export {
  characterSectionSelection,
  clearCharacterFacet,
  clearCharacterSelection,
  listProjectionOwnsFocus,
  selectCharacter,
  selectCharacterFacet,
  selectCharacterFromPicker,
  useSelectedCharacterFacetId,
  useSelectedCharacterId,
} from "./character-selection-store.ts";
export type { ActiveChatHandle, ChatHandle } from "./chat-handle.ts";
export { committedChat, draftChat, isCommitted, isLanding, landingChat } from "./chat-handle.ts";
export type { ChatListCharacterFilter } from "./chat-list-filter-store.ts";
export {
  clearChatListCharacterFilter,
  setChatListCharacterFilter,
  useChatListCharacterFilter,
} from "./chat-list-filter-store.ts";
export type { ChatStreamApi, TurnSlot } from "./chat-stream.ts";
export {
  __setFrameSchedulerForTest,
  chatStream,
  isLiveTurnPhase,
  subscribeTurnSlot,
  subscribeUserMessageCommitted,
  useSwipeTargetMessageId,
  useTurnPhase,
  useTurnSlot,
  useTurnSpeakerCharacterId,
} from "./chat-stream.ts";
export type { ChromeEntry, ChromeEntryBehavior, ChromePresentation, ChromeZone, MobileCuration } from "./chrome-registry.ts";
export { CHROME_ZONES } from "./chrome-registry.ts";
export type { ChromeRegistry } from "./chrome-registry-context.ts";
export { useChromeRegistry } from "./chrome-registry-context.ts";
export { ChromeRegistryProvider } from "./chrome-registry-provider.tsx";
export { migrateComposerDraft, setComposerDraft, useComposerDraft } from "./composer-draft-store.ts";
export { requestComposerFocus, useComposerFocusRequest } from "./composer-focus-store.ts";
export { __resetCollectionGroupOpen, openCollectionGroup, toggleCollectionGroup, useCollectionGroupOpen } from "./config-group-open-store.ts";
export {
  clearCollectionSelection,
  configSectionSelection,
  goToCollection,
  selectCollectionMember,
  selectCollectionMemberFromList,
  useCollectionSelection,
} from "./config-selection-store.ts";
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
export type { GatedSet, GatedStoreHook } from "./create-gated-store.ts";
export { createGatedStore, STORE_DEVTOOLS_ENABLED } from "./create-gated-store.ts";
export type { KindedDrillStore, KindedSelection } from "./create-kinded-selection-store.ts";
export { createKindedSelectionStore } from "./create-kinded-selection-store.ts";
export type { PersistedStoreOptions } from "./create-persisted-store.ts";
export { createPersistedStore } from "./create-persisted-store.ts";
export { clearDocumentSelection, databankSectionSelection, selectDocumentFromList, useSelectedDocumentId } from "./databank-selection-store.ts";
export type { DraftConfig, DraftRosterOverride } from "./draft-config-store.ts";
export {
  addDraftCharacter,
  clearDraftConfig,
  EMPTY_DRAFT_CONFIG,
  readDraftConfig,
  resolveDraftCharacterIds,
  setDraftGreeting,
  setDraftGroupConfig,
  setDraftInjections,
  setDraftRoomOverrides,
  setDraftRosterOverride,
  setDraftStartAsGame,
  useDraftConfig,
} from "./draft-config-store.ts";
export { __readHomeTileBoxForTest, __resetHomeTileBoxes, rememberHomeTileBox, useHomeTileBox } from "./home-tile-box-store.ts";
export {
  __readMessageEditDraftForTest,
  cancelEditingMessage,
  setMessageEditDraft,
  startEditingMessage,
  useIsEditingMessage,
  useMessageEditDraftText,
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
export type { MessageToolsRendererRegistry } from "./message-tools-renderer-registry-context.ts";
export { MessageToolsRendererRegistryContext } from "./message-tools-renderer-registry-context.ts";
export { MessageToolsRendererRegistryProvider } from "./message-tools-renderer-registry-provider.tsx";
export type {
  ModalDefinition,
  ModalTrigger,
  ModalTriggerPlacement,
} from "./modal-registry.ts";
export { MODAL_TRIGGER_PLACEMENTS } from "./modal-registry.ts";
export type { ModalRegistry } from "./modal-registry-context.ts";
export { useModalRegistry } from "./modal-registry-context.ts";
export { ModalRegistryProvider } from "./modal-registry-provider.tsx";
export type { OverlayPanelRequest, PanelMode, PanelName } from "./panel-resolve.ts";
export { PANEL_MODES, resolvePanelMode } from "./panel-resolve.ts";
export { setPresetEditorView, usePresetEditorView } from "./preset-editor-view-store.ts";
export {
  __dismissPresetSectionForTest,
  __resetPresetSection,
  __resetPresetSelection,
  presetSectionSelection,
  selectPreset,
  selectPresetFromList,
  selectPresetSection,
  useSelectedPresetId,
  useSelectedPresetSectionId,
} from "./preset-selection-store.ts";
export { __resetPresetTemplate, selectPresetTemplate, useSelectedPresetTemplateId } from "./preset-template-selection-store.ts";
export {
  __readRecentModelsForTest,
  __resetAllRecentModels,
  pushRecentModel,
  RECENT_MODELS_CAP,
  useRecentModels,
} from "./recent-models-store.ts";
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
export { useListDocked, useSectionListIsScreen } from "./section-list-projection.ts";
export type {
  RailEntry,
  RailZone,
  SectionDefinition,
  SectionGroup,
  SectionPanelAvailability,
  SectionPlaceholderCopy,
  SectionSelection,
} from "./section-registry.ts";
export { NO_SELECTION_TITLE, RAIL_ZONES, SECTION_GROUPS } from "./section-registry.ts";
export type { SectionRegistry } from "./section-registry-context.ts";
export { useSectionRegistry } from "./section-registry-context.ts";
export { SectionRegistryProvider } from "./section-registry-provider.tsx";
export type {
  AppSettingsClaimPath,
  ResolvedSettingsSection,
  SettingsGroup,
  SettingsKeyClaim,
  SettingsPaneBody,
  SettingsPaneDefinition,
  SettingsSectionContribution,
  SettingsSubcategory,
  SettingsViewerView,
  UnclaimedSettingsKey,
} from "./settings-pane-registry.ts";
export {
  assertSettingsKeyPartition,
  resolveSettingsSections,
  SETTINGS_GROUPS,
  settingsAnchorId,
  settingsSectionNavs,
  UNCLAIMED_SETTINGS_KEYS,
} from "./settings-pane-registry.ts";
export type { SettingsPaneRegistry } from "./settings-pane-registry-context.ts";
export { useSettingsPaneRegistry } from "./settings-pane-registry-context.ts";
export { SettingsPaneRegistryProvider } from "./settings-pane-registry-provider.tsx";
export type { SaveLifecycleState } from "./settings-save-status-store.ts";
export {
  clearSectionSaveStatus,
  reportSectionSaveStatus,
  SAVE_LIFECYCLE_STATES,
  useAggregateSaveStatus,
  useErroredSaveSections,
} from "./settings-save-status-store.ts";
export type { SettingsSectionRegistry } from "./settings-section-registry-context.ts";
export { useSettingsSectionRegistry, useSettingsSections } from "./settings-section-registry-context.ts";
export { SettingsSectionRegistryProvider } from "./settings-section-registry-provider.tsx";
export type { ModalSlotId, SectionId, SettingsCategoryId } from "./shell-store.ts";
export {
  closeModal,
  MODAL_SLOT_IDS,
  openModal,
  openSettingsTo,
  revealContextPanel,
  revealContextPanelBesideContent,
  SECTION_IDS,
  SETTINGS_CATEGORY_IDS,
  setActiveSection,
  setContextTab,
  setFocusMode,
  setMobileViewport,
  setNarrowViewport,
  setOpenOverlayPanel,
  setPanelMode,
  useActiveSection,
  useContextTab,
  useFocusMode,
  useMobileViewport,
  useNarrowViewport,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  useSettingsSubTarget,
  useSettingsTarget,
} from "./shell-store.ts";
export type { SlashCommandRegistry } from "./slash-command-registry-context.ts";
export { SlashCommandRegistryContext } from "./slash-command-registry-context.ts";
export { SlashCommandRegistryProvider } from "./slash-command-registry-provider.tsx";
export {
  __readRecentSteersForTest,
  __resetRecentSteers,
  pushFiredSteer,
  STEER_RECOVERY_CAP,
  useRecentSteers,
} from "./steer-recovery-store.ts";
export { setTagSortMode, useTagSortMode } from "./tag-library-store.ts";
export { clearWorldEntrySelection, selectWorldEntry, useSelectedWorldEntryId } from "./world-entry-selection-store.ts";
