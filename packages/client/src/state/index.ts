// state/ front door — ALL gated Zustand stores + the client-state types (UI-Arch §2.1/§5). Server
// state NEVER lives here (TanStack Query owns it); these are the transient/device-local concerns.
// Store minting has exactly TWO doors, both devtools-instrumented + action-labeled:
// `createGatedStore` (hook-shaped singletons) and `createEntityDraftStore` (persist-shaped,
// per-entity vanilla factories).

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
export type { GatedSet, GatedStoreHook } from "./create-gated-store";
export { createGatedStore, STORE_DEVTOOLS_ENABLED } from "./create-gated-store";
