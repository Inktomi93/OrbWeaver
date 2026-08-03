// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.
// Store minting has THREE doors, all devtools-instrumented + action-labeled: `createGatedStore`
// (hook-shaped singletons), `createEntityDraftStore` (persist-shaped, per-entity vanilla factories),
// and `createPersistedStore` (hook-shaped singletons that persist to storage).

export type { DraftSeed } from "./active-chat-store";
export {
  chatDeletedFromList,
  clearNewChatPreset,
  commitDraft,
  goToLanding,
  openNewChatPicker,
  selectChat,
  selectChatFromList,
  startNewChat,
  useActiveChatHandle,
  useActiveChatId,
  useActiveDraftSeed,
  useActiveSessionKey,
  useNewChatPreset,
} from "./active-chat-store";
export {
  clearAnalyticsSelection,
  selectAnalyticsCharacter,
  useSelectedAnalyticsCharacterId,
} from "./analytics-selection-store";
export type { AssembleChromeInput } from "./assemble-chrome";
export { assembleChrome } from "./assemble-chrome";
export type { CharacterViewMode } from "./character-library-store";
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
} from "./character-library-store";
export {
  clearCharacterFacet,
  clearCharacterSelection,
  listProjectionOwnsFocus,
  selectCharacter,
  selectCharacterFacet,
  selectCharacterFromPicker,
  useSelectedCharacterFacetId,
  useSelectedCharacterId,
} from "./character-selection-store";
export type { ActiveChatHandle, ChatHandle } from "./chat-handle";
export { committedChat, draftChat, isCommitted, isLanding, landingChat } from "./chat-handle";
export type { ChatListCharacterFilter } from "./chat-list-filter-store";
export {
  clearChatListCharacterFilter,
  setChatListCharacterFilter,
  useChatListCharacterFilter,
} from "./chat-list-filter-store";
export type { ChatStreamApi, TurnSlot } from "./chat-stream";
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
} from "./chat-stream";
export type { ChromeEntry, ChromeEntryBehavior, ChromePresentation, ChromeZone, MobileCuration } from "./chrome-registry";
export { CHROME_ZONES } from "./chrome-registry";
export type { ChromeRegistry } from "./chrome-registry-context";
export { useChromeRegistry } from "./chrome-registry-context";
export { ChromeRegistryProvider } from "./chrome-registry-provider";
export { migrateComposerDraft, setComposerDraft, useComposerDraft } from "./composer-draft-store";
export { requestComposerFocus, useComposerFocusRequest } from "./composer-focus-store";
export { __resetCollectionGroupOpen, openCollectionGroup, toggleCollectionGroup, useCollectionGroupOpen } from "./config-group-open-store";
export {
  clearCollectionSelection,
  goToCollection,
  selectCollectionMember,
  selectCollectionMemberFromList,
  useCollectionSelection,
} from "./config-selection-store";
export {
  clearCorpusSelection,
  selectCorpusCharacter,
  useSelectedCorpusCharacterId,
} from "./corpus-selection-store";
export type { DrillSelectionStore, PrimaryDrillStore } from "./create-drill-selection-store";
export { createDrillSelectionStore } from "./create-drill-selection-store";
export type { EntityDraftStore, EntityDraftStoreConfig } from "./create-entity-draft-store";
export { createEntityDraftStore } from "./create-entity-draft-store";
export type { GatedSet, GatedStoreHook } from "./create-gated-store";
export { createGatedStore, STORE_DEVTOOLS_ENABLED } from "./create-gated-store";
export type { KindedDrillStore, KindedSelection } from "./create-kinded-selection-store";
export { createKindedSelectionStore } from "./create-kinded-selection-store";
export type { PersistedStoreOptions } from "./create-persisted-store";
export { createPersistedStore } from "./create-persisted-store";
export { clearDocumentSelection, selectDocumentFromList, useSelectedDocumentId } from "./databank-selection-store";
export type { DraftConfig, DraftRosterOverride } from "./draft-config-store";
export {
  addDraftCharacter,
  clearDraftConfig,
  EMPTY_DRAFT_CONFIG,
  readDraftConfig,
  setDraftGreeting,
  setDraftGroupConfig,
  setDraftInjections,
  setDraftRoomOverrides,
  setDraftRosterOverride,
  setDraftStartAsGame,
  useDraftConfig,
} from "./draft-config-store";
export { __readHomeTileBoxForTest, __resetHomeTileBoxes, rememberHomeTileBox, useHomeTileBox } from "./home-tile-box-store";
export {
  __readMessageEditDraftForTest,
  cancelEditingMessage,
  setMessageEditDraft,
  startEditingMessage,
  useIsEditingMessage,
  useMessageEditDraftText,
} from "./message-edit-draft";
export {
  __resetSelection,
  enterSelectionMode,
  exitSelectionMode,
  readSelectedMessageIds,
  toggleMessageSelected,
  useIsMessageSelected,
  useSelectedCount,
  useSelectionActive,
} from "./message-selection-store";
export type { MessageToolsRendererRegistry } from "./message-tools-renderer-registry-context";
export { MessageToolsRendererRegistryContext } from "./message-tools-renderer-registry-context";
export { MessageToolsRendererRegistryProvider } from "./message-tools-renderer-registry-provider";
export type {
  ModalDefinition,
  ModalTrigger,
  ModalTriggerPlacement,
} from "./modal-registry";
export { MODAL_TRIGGER_PLACEMENTS } from "./modal-registry";
export type { ModalRegistry } from "./modal-registry-context";
export { useModalRegistry } from "./modal-registry-context";
export { ModalRegistryProvider } from "./modal-registry-provider";
export { setPresetEditorView, usePresetEditorView } from "./preset-editor-view-store";
export {
  __dismissPresetSectionForTest,
  __resetPresetSection,
  __resetPresetSelection,
  selectPreset,
  selectPresetFromList,
  selectPresetSection,
  useSelectedPresetId,
  useSelectedPresetSectionId,
} from "./preset-selection-store";
export { __resetPresetTemplate, selectPresetTemplate, useSelectedPresetTemplateId } from "./preset-template-selection-store";
export {
  __readRecentModelsForTest,
  __resetAllRecentModels,
  pushRecentModel,
  RECENT_MODELS_CAP,
  useRecentModels,
} from "./recent-models-store";
export type {
  RailEntry,
  RailZone,
  SectionDefinition,
  SectionGroup,
  SectionPanelAvailability,
  SectionPlaceholderCopy,
} from "./section-registry";
export { RAIL_ZONES, SECTION_GROUPS } from "./section-registry";
export type { SectionRegistry } from "./section-registry-context";
export { useSectionRegistry } from "./section-registry-context";
export { SectionRegistryProvider } from "./section-registry-provider";
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
} from "./settings-pane-registry";
export {
  assertSettingsKeyPartition,
  resolveSettingsSections,
  SETTINGS_GROUPS,
  settingsAnchorId,
  settingsSectionNavs,
  UNCLAIMED_SETTINGS_KEYS,
} from "./settings-pane-registry";
export type { SettingsPaneRegistry } from "./settings-pane-registry-context";
export { useSettingsPaneRegistry } from "./settings-pane-registry-context";
export { SettingsPaneRegistryProvider } from "./settings-pane-registry-provider";
export type { SaveLifecycleState } from "./settings-save-status-store";
export {
  clearSectionSaveStatus,
  reportSectionSaveStatus,
  SAVE_LIFECYCLE_STATES,
  useAggregateSaveStatus,
  useErroredSaveSections,
} from "./settings-save-status-store";
export type { SettingsSectionRegistry } from "./settings-section-registry-context";
export { useSettingsSectionRegistry, useSettingsSections } from "./settings-section-registry-context";
export { SettingsSectionRegistryProvider } from "./settings-section-registry-provider";
export type {
  ModalSlotId,
  PanelMode,
  PanelName,
  SectionId,
  SettingsCategoryId,
} from "./shell-store";
export {
  closeModal,
  MODAL_SLOT_IDS,
  openModal,
  openSettingsTo,
  PANEL_MODES,
  resolvePanelMode,
  revealContextPanel,
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
  useListDocked,
  useNarrowViewport,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  useSettingsSubTarget,
  useSettingsTarget,
} from "./shell-store";
export type { SlashCommandRegistry } from "./slash-command-registry-context";
export { SlashCommandRegistryContext } from "./slash-command-registry-context";
export { SlashCommandRegistryProvider } from "./slash-command-registry-provider";
export {
  __readRecentSteersForTest,
  __resetRecentSteers,
  pushFiredSteer,
  STEER_RECOVERY_CAP,
  useRecentSteers,
} from "./steer-recovery-store";
export { setTagSortMode, useTagSortMode } from "./tag-library-store";
export { clearWorldEntrySelection, selectWorldEntry, useSelectedWorldEntryId } from "./world-entry-selection-store";
