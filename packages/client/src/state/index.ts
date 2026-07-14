// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.
// Store minting has THREE doors, all devtools-instrumented + action-labeled: `createGatedStore`
// (hook-shaped singletons), `createEntityDraftStore` (persist-shaped, per-entity vanilla factories),
// and `createPersistedStore` (hook-shaped singletons that persist to storage).

export type { DraftSeed } from "./active-chat-store";
export {
  commitDraft,
  goToLanding,
  selectChat,
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
  selectCharacter,
  selectCharacterFacet,
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
  subscribeTurnSlot,
  subscribeUserMessageCommitted,
  useTurnPhase,
  useTurnSlot,
  useTurnSpeakerCharacterId,
} from "./chat-stream";
export {
  clearCorpusSelection,
  selectCorpusCharacter,
  useSelectedCorpusCharacterId,
} from "./corpus-selection-store";
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
  useDraftConfig,
} from "./draft-config-store";
export { dismissImportOnboarding, useImportOnboardingDismissed } from "./import-onboarding-store";
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
export {
  clearPresetSection,
  clearPresetSelection,
  selectPreset,
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
  SectionDefinition,
  SectionGroup,
  SectionPlaceholderCopy,
} from "./section-registry";
export type { ModalSlotId, PanelMode, PanelName, SectionId } from "./shell-store";
export {
  closeModal,
  MODAL_SLOT_IDS,
  openModal,
  openSettingsTo,
  PANEL_MODES,
  revealContextPanel,
  SECTION_IDS,
  setActiveSection,
  setContextTab,
  setMobileSheet,
  setPanelMode,
  useActiveSection,
  useContextTab,
  useMobileSheet,
  useOpenModal,
  usePanelOverride,
  useSettingsTarget,
} from "./shell-store";
export {
  clearWorldBookSelection,
  clearWorldEntrySelection,
  selectWorldBook,
  selectWorldBookFromList,
  selectWorldEntry,
  useSelectedWorldBookId,
  useSelectedWorldEntryId,
} from "./world-info-selection-store";
