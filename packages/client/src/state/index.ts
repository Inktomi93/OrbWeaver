// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.

export type { ChatHandle } from "./chat-handle";
export { committedChat, draftChat, isCommitted } from "./chat-handle";
export type { ChatStreamApi, TurnSlot } from "./chat-stream";
export {
  chatStream,
  IDLE_TURN,
  subscribeTurnSlot,
  useTurnPhase,
  useTurnSlot,
} from "./chat-stream";
export type { EntityDraftStore, EntityDraftStoreConfig } from "./create-entity-draft-store";
export { createEntityDraftStore } from "./create-entity-draft-store";
