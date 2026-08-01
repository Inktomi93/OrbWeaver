// The tRPC driver front door. entry/ imports the appRouter + createContext seam; @orb/client type-imports
// AppRouter. The procedure ladder (trpc.ts) is internal — routers import it relatively, never the barrel.

export { publishAutomationEvent, subscribeAutomation } from "./automation-bus";
export { notifyChatOpened, setChatOpenTap } from "./automation-chat-open-tap";
export type { ChatLiveEvent } from "./chat-events-bus";
export { publishChatEvent, subscribeAllChatEvents, subscribeChatEvents } from "./chat-events-bus";
export type { Context, RateLimitDecision, RateLimitGate, Services } from "./context";
export { createContext } from "./context";
export { classifyDomainError, domainReason } from "./error-mapping";
export { publishNotification } from "./notifications-bus";
export type { PresenceRegistry } from "./presence-registry";
export { createPresenceRegistry } from "./presence-registry";
export type { AppRouter } from "./router";
export { appRouter, createCaller } from "./router";
export type { FrameQueue } from "./stream/frame-queue";
export { createFrameQueue, FRAME_QUEUE_CAPACITY, OVERFLOW_POLICIES } from "./stream/frame-queue";
export type { RoomArgs, RoomSourceDef } from "./stream/room-source";
export { ROOM_SOURCES, roomSourceFor } from "./stream/room-sources";
export type { SocketCell, SocketListener, SocketRegistry, SocketRoom } from "./stream/socket-registry";
export { createSocketRegistry, ROOMS_PER_SOCKET, SOCKET_REAP_MS, SOCKETS_PER_USER } from "./stream/socket-registry";
export type { SubscriptionErrorFrame } from "./subscriptions";
export { withSubscriptionErrors } from "./subscriptions";
export { publishChatChanged, publishUserEvent, subscribeUserEvents } from "./user-events-bus";
