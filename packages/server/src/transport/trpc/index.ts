// transport/trpc — the tRPC driver front door. `entry/` imports the `appRouter` + `createContext` seam
// (it constructs the `Services`/`RateLimitGate` and mounts the fetch handler); `@orb/client` type-imports
// `AppRouter`. The procedure ladder (`trpc.ts`) is internal — routers import it relatively, never the barrel.

// The per-chat live fan-out (`bus.emit (durable, returns seq) → publishChatEvent (live)`; PD-46 stream half).
export type { ChatLiveEvent } from "./chat-events-bus";
export { publishChatEvent, subscribeChatEvents } from "./chat-events-bus";
export type { Context, RateLimitDecision, RateLimitGate, Services } from "./context";
export { createContext } from "./context";
// The pure `DomainError → tRPC code` classifier — exported for its isolation test (Invariant #5) + any
// entry-side error introspection; the ladder + the SSE wrapper consume it internally.
export { classifyDomainError } from "./error-mapping";
// The transport-owned per-user notifications bus — `entry/` composes `EmitNotification` as
// `record (durable) → publishNotification (live)` (durable-first; PD-23).
export { publishNotification } from "./notifications-bus";
// The transport-owned server-derived presence registry (SSE ref-count per userId; PD-70). `entry/` builds it
// over the injected clock, threads `read` into chat's `presence.read` op + `connect` onto the request ctx.
export type { PresenceRegistry } from "./presence-registry";
export { createPresenceRegistry } from "./presence-registry";
export type { AppRouter } from "./router";
export { appRouter, createCaller } from "./router";
export type { SubscriptionErrorFrame } from "./subscriptions";
export { withSubscriptionErrors } from "./subscriptions";
