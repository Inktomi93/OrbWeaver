// bus/ front door — the SSE→client-state seam: ONE pure exhaustive reducer + ONE thin transport
// adapter (UI-Gates §11.1). Nothing else may translate bus events into state.

export type { ChatBusDeps } from "./apply-chat-bus-event.ts";
export { applyChatBusEvent } from "./apply-chat-bus-event.ts";
export { markTurnStopping, useChatBusDeps } from "./chat-bus-writes.ts";
export type { ChatEventSeqGuard } from "./chat-event-seq-guard.ts";
export { createChatEventSeqGuard } from "./chat-event-seq-guard.ts";
export type { RoomSubscriber, RoomTransport } from "./room-registry.ts";
export { createRoomRegistry, roomRegistry } from "./room-registry.ts";
export { socketId } from "./socket-id.ts";
export type { BusRoomHandlers } from "./use-bus-room.ts";
export { useBusRoom } from "./use-bus-room.ts";
export { useChatBus } from "./use-chat-bus.ts";
export { useOrbSocket } from "./use-orb-socket.ts";
export type { RpgBusDeps } from "./use-rpg-bus.ts";
export { useRpgBus } from "./use-rpg-bus.ts";
export type { UserBusDeps } from "./use-user-bus.ts";
export { useUserBus } from "./use-user-bus.ts";
