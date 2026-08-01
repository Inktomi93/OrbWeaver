// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.
// Store minting has THREE doors, all devtools-instrumented + action-labeled: `createGatedStore`
// (hook-shaped singletons), `createEntityDraftStore` (persist-shaped, per-entity vanilla factories),
// and `createPersistedStore` (hook-shaped singletons that persist to storage).

export type { DraftSeed } from "./active-chat-store";
export {
  chatDeletedFromList,
  commitDraft,
  goToLanding,
  selectChat,
  selectChatFromList,
  startNewChat,
  useActiveChatHandle,
  useActiveChatId,
  useActiveDraftSeed,
  useActiveSessionKey,
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
  CHARACTER_VIEW_MODES,
  clearTagFilter,
  setBulkMode,
  setCharacterSortMode,
  setCharacterViewMode,
  toggleFavoritesOnly,
  toggleShowArchived,
  toggleSpoilerBlur,
  toggleTagFilter,
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
  chatStream,
  isLiveTurnPhase,
  setFrameScheduler,
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
export { ChromeRegistryContext, useChromeRegistry } from "./chrome-registry-context";
export { ChromeRegistryProvider } from "./chrome-registry-provider";
export { migrateComposerDraft, setComposerDraft, useComposerDraft } from "./composer-draft-store";
export { requestComposerFocus, useComposerFocusRequest } from "./composer-focus-store";
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
export type { PersistedStoreOptions } from "./create-persisted-store";
export { createPersistedStore } from "./create-persisted-store";
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
export {
  cancelEditingMessage,
  readMessageEditDraft,
  setMessageEditDraft,
  startEditingMessage,
  useIsEditingMessage,
  useMessageEditDraftText,
} from "./message-edit-draft";
export {
  clearSelection,
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
export { ModalRegistryContext, useModalRegistry } from "./modal-registry-context";
export { ModalRegistryProvider } from "./modal-registry-provider";
export {
  clearPresetSection,
  clearPresetSelection,
  dismissPresetSection,
  selectPreset,
  selectPresetFromList,
  selectPresetSection,
  useSelectedPresetId,
  useSelectedPresetSectionId,
} from "./preset-selection-store";
export {
  clearAllRecentModels,
  pushRecentModel,
  RECENT_MODELS_CAP,
  readRecentModels,
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
export { SectionRegistryContext, useSectionRegistry } from "./section-registry-context";
export { SectionRegistryProvider } from "./section-registry-provider";
export type {
  ResolvedSettingsSection,
  SettingsGroup,
  SettingsPaneDefinition,
  SettingsSectionContribution,
  SettingsSubcategory,
  SettingsViewerView,
} from "./settings-pane-registry";
export { resolveSettingsSections, SETTINGS_GROUPS, settingsAnchorId, settingsSectionNavs } from "./settings-pane-registry";
export type { SettingsPaneRegistry } from "./settings-pane-registry-context";
export {
  SettingsPaneRegistryContext,
  useSettingsPaneRegistry,
} from "./settings-pane-registry-context";
export { SettingsPaneRegistryProvider } from "./settings-pane-registry-provider";
export type {
  ModalSlotId,
  PanelMode,
  PanelName,
  SectionId,
  SettingsCategoryId,
  SettingsSectionAnchor,
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
  SETTINGS_SECTION_ANCHORS,
  setActiveSection,
  setContextTab,
  setMobileViewport,
  setNarrowViewport,
  setOpenOverlayPanel,
  setPanelMode,
  useActiveSection,
  useContextTab,
  useListDocked,
  useNarrowViewport,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  useSettingsTarget,
} from "./shell-store";
export type { SlashCommandRegistry } from "./slash-command-registry-context";
export { SlashCommandRegistryContext } from "./slash-command-registry-context";
export { SlashCommandRegistryProvider } from "./slash-command-registry-provider";
export {
  clearRecentSteers,
  pushFiredSteer,
  readRecentSteers,
  STEER_RECOVERY_CAP,
  useRecentSteers,
} from "./steer-recovery-store";
export {
  clearWorldBookSelection,
  clearWorldEntrySelection,
  selectWorldBook,
  selectWorldBookFromList,
  selectWorldEntry,
  useSelectedWorldBookId,
  useSelectedWorldEntryId,
} from "./world-info-selection-store";
