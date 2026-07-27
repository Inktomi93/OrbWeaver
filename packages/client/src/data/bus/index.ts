// bus/ front door — the SSE→client-state seam: ONE pure exhaustive reducer + ONE thin transport
// adapter (UI-Gates §11.1). Nothing else may translate bus events into state.

export type { ChatBusDeps } from "./apply-chat-bus-event";
export { applyChatBusEvent } from "./apply-chat-bus-event";
export { markTurnStopping, useChatBusDeps } from "./chat-bus-writes";
export type { ChatEventSeqGuard } from "./chat-event-seq-guard";
export { createChatEventSeqGuard } from "./chat-event-seq-guard";
export { useChatBus } from "./use-chat-bus";
export type { RpgBusDeps } from "./use-rpg-bus";
export { useRpgBus } from "./use-rpg-bus";
export type { UserBusDeps } from "./use-user-bus";
export { useUserBus } from "./use-user-bus";
