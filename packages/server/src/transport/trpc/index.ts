// transport/trpc — the tRPC driver front door. `entry/` imports the `appRouter` + `createContext` seam
// (it constructs the `Services`/`RateLimitGate` and mounts the fetch handler); `@orb/client` type-imports
// `AppRouter`. The procedure ladder (`trpc.ts`) is internal — routers import it relatively, never the barrel.

export type { Context, RateLimitDecision, RateLimitGate, Services } from "./context";
export { createContext } from "./context";
// The pure `DomainError → tRPC code` classifier — exported for its isolation test (Invariant #5) + any
// entry-side error introspection; the ladder + the SSE wrapper consume it internally.
export { classifyDomainError } from "./error-mapping";
// The transport-owned per-user notifications bus — `entry/` composes `EmitNotification` as
// `record (durable) → publishNotification (live)` (durable-first; PD-23).
export { publishNotification } from "./notifications-bus";
export type { AppRouter } from "./router";
export { appRouter, createCaller } from "./router";
export type { SubscriptionErrorFrame } from "./subscriptions";
export { withSubscriptionErrors } from "./subscriptions";
