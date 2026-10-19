// The tRPC driver front door. entry/ imports the appRouter + createContext seam; @orb/client type-imports
// AppRouter. The procedure ladder (trpc.ts) is internal — routers import it relatively, never the barrel.

export { publishAutomationEvent } from "./automation-bus.ts";
export { setChatOpenTap } from "./automation-chat-open-tap.ts";
export type { ChatLiveEvent } from "./chat-events-bus.ts";
export { publishChatEvent, subscribeAllChatEvents } from "./chat-events-bus.ts";
export type { Context, RateLimitDecision, RateLimitGate, Services } from "./context.ts";
export { createContext } from "./context.ts";
export type { LiveBuses } from "./contract/live-buses.ts";
export type { RoomArgs, RoomSourceDef } from "./contract/room-source.ts";
export type { SubscriptionErrorFrame } from "./contract/subscriptions.ts";
export { classifyDomainError } from "./error-mapping.ts";
export { createLiveBuses } from "./live-buses.ts";
export { publishNotification } from "./notifications-bus.ts";
export type { PresenceRegistry } from "./presence-registry.ts";
export { createPresenceRegistry } from "./presence-registry.ts";
export { silenceRoomEntityFan, withQuietBulkFanout } from "./quiet-fanout.ts";
export type { AppRouter } from "./router.ts";
export { appRouter, createCaller } from "./router.ts";
export type { FrameQueue } from "./stream/frame-queue.ts";
export { OVERFLOW_POLICIES } from "./stream/frame-queue.ts";
export { ROOM_SOURCES } from "./stream/room-sources.ts";
export type { SocketCell, SocketListener, SocketRegistry, SocketRoom } from "./stream/socket-registry.ts";
export { createSocketRegistry } from "./stream/socket-registry.ts";
export { withSubscriptionErrors } from "./subscriptions.ts";
export { publishChatChanged, publishUserEvent } from "./user-events-bus.ts";
