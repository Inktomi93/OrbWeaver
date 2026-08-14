// The tRPC driver front door. entry/ imports the appRouter + createContext seam; @orb/client type-imports
// AppRouter. The procedure ladder (trpc.ts) is internal — routers import it relatively, never the barrel.

export { publishAutomationEvent, subscribeAutomation } from "./automation-bus.ts";
export { notifyChatOpened, setChatOpenTap } from "./automation-chat-open-tap.ts";
export type { ChatLiveEvent } from "./chat-events-bus.ts";
export { publishChatEvent, subscribeAllChatEvents, subscribeChatEvents } from "./chat-events-bus.ts";
export type { Context, RateLimitDecision, RateLimitGate, Services } from "./context.ts";
export { createContext } from "./context.ts";
export { classifyDomainError, domainReason } from "./error-mapping.ts";
export { publishNotification } from "./notifications-bus.ts";
export type { PresenceRegistry } from "./presence-registry.ts";
export { createPresenceRegistry } from "./presence-registry.ts";
export { silenceRoomEntityFan, withQuietBulkFanout } from "./quiet-fanout.ts";
export type { AppRouter } from "./router.ts";
export { appRouter, createCaller } from "./router.ts";
export type { FrameQueue } from "./stream/frame-queue.ts";
export { createFrameQueue, FRAME_QUEUE_CAPACITY, OVERFLOW_POLICIES } from "./stream/frame-queue.ts";
export type { RoomArgs, RoomSourceDef } from "./stream/room-source.ts";
export { ROOM_SOURCES, roomSourceFor } from "./stream/room-sources.ts";
export type { SocketCell, SocketListener, SocketRegistry, SocketRoom } from "./stream/socket-registry.ts";
export { createSocketRegistry, ROOMS_PER_SOCKET, SOCKET_REAP_MS, SOCKETS_PER_USER } from "./stream/socket-registry.ts";
export type { SubscriptionErrorFrame } from "./subscriptions.ts";
export { withSubscriptionErrors } from "./subscriptions.ts";
export { publishChatChanged, publishUserEvent, subscribeUserEvents } from "./user-events-bus.ts";
