// The tRPC driver front door. entry/ imports the appRouter + createContext seam; @orb/client type-imports
// AppRouter. The procedure ladder (trpc.ts) is internal — routers import it relatively, never the barrel.

export { publishAutomationEvent, subscribeAutomation } from "./automation-bus";
export { notifyChatOpened, setChatOpenTap } from "./automation-chat-open-tap";
export { publishBuddyEvent, snapshotBuddy, subscribeBuddy } from "./buddy-bus";
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
export type { SubscriptionErrorFrame } from "./subscriptions";
export { withSubscriptionErrors } from "./subscriptions";
export { publishChatChanged, publishUserEvent, subscribeUserEvents } from "./user-events-bus";
