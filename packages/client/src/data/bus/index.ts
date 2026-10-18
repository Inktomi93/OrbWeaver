// bus/ front door — the SSE→client-state seam: ONE pure exhaustive reducer + ONE thin transport
// adapter (UI-Gates §11.1). Nothing else may translate bus events into state.

export type { ChatBusDeps } from "./apply-chat-bus-event.ts";
export {} from "./apply-chat-bus-event.ts";
export { markTurnStopping, recoverTurnAfterStopFailure, useChatBusDeps } from "./chat-bus-writes.ts";
export {} from "./chat-event-seq-guard.ts";
export {} from "./post-event-source.ts";
export {} from "./room-registry.ts";

export {} from "./socket-id.ts";

export { useBusRoom } from "./use-bus-room.ts";
export { useChatBus } from "./use-chat-bus.ts";
export { useOrbSocket } from "./use-orb-socket.ts";
export { useRpgBus } from "./use-rpg-bus.ts";
export { useUserBus } from "./use-user-bus.ts";
