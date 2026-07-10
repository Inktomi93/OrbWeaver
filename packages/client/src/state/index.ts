// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.
// Store minting has exactly TWO doors, both devtools-instrumented + action-labeled:
// `createGatedStore` (hook-shaped singletons) and `createEntityDraftStore` (persist-shaped,
// per-entity vanilla factories).

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
  clearCharacterSelection,
  selectCharacter,
  useSelectedCharacterId,
} from "./character-selection-store";
export type { ActiveChatHandle, ChatHandle } from "./chat-handle";
export { committedChat, draftChat, isCommitted, isLanding, landingChat } from "./chat-handle";
export type { ChatStreamApi, TurnSlot } from "./chat-stream";
export {
  chatStream,
  IDLE_TURN,
  isLiveTurnPhase,
  subscribeTurnSlot,
  subscribeUserMessageCommitted,
  useTurnPhase,
  useTurnSlot,
  useTurnSpeakerCharacterId,
} from "./chat-stream";
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
export type { ModalSlotId, PanelMode, PanelName, SectionId } from "./shell-store";
export {
  closeModal,
  MODAL_SLOT_IDS,
  openModal,
  PANEL_MODES,
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
} from "./shell-store";
