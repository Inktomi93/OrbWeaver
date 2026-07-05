// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.
// Store minting has exactly TWO doors, both devtools-instrumented + action-labeled:
// `createGatedStore` (hook-shaped singletons) and `createEntityDraftStore` (persist-shaped,
// per-entity vanilla factories).

export type { DraftSeed } from "./active-chat-store";
export {
  commitDraft,
  selectChat,
  startNewChat,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSessionKey,
} from "./active-chat-store";
export type { ChatHandle } from "./chat-handle";
export { committedChat, draftChat, isCommitted } from "./chat-handle";
export type { ChatStreamApi, TurnSlot } from "./chat-stream";
export {
  chatStream,
  IDLE_TURN,
  isLiveTurnPhase,
  readTurnPhase,
  subscribeTurnSlot,
  useTurnPhase,
  useTurnSlot,
} from "./chat-stream";
export type { EntityDraftStore, EntityDraftStoreConfig } from "./create-entity-draft-store";
export { createEntityDraftStore } from "./create-entity-draft-store";
export type { GatedSet, GatedStoreHook } from "./create-gated-store";
export { createGatedStore, STORE_DEVTOOLS_ENABLED } from "./create-gated-store";
export type { PersistedStoreOptions } from "./create-persisted-store";
export { createPersistedStore } from "./create-persisted-store";
export {
  cancelEditingMessage,
  readMessageEditDraft,
  setMessageEditDraft,
  startEditingMessage,
  useIsEditingMessage,
  useMessageEditDraftText,
} from "./message-edit-draft";
export type { ModalSlotId, PanelMode, PanelName, SectionId } from "./shell-store";
export {
  closeModal,
  MODAL_SLOT_IDS,
  openModal,
  PANEL_MODES,
  SECTION_IDS,
  setActiveSection,
  setPanelMode,
  toggleFocus,
  togglePanel,
  useActiveSection,
  useIsImmersive,
  useOpenModal,
  usePanelMode,
} from "./shell-store";
