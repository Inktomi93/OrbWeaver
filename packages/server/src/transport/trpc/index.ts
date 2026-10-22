// The tRPC driver front door. entry/ imports the appRouter + createContext seam; @orb/client type-imports
// AppRouter. The procedure ladder (trpc.ts) is internal — routers import it relatively, never the barrel.

export type { RateLimitDecision, RateLimitGate, Services } from "./context.ts";
export { createContext } from "./context.ts";
export type { LiveBuses } from "./contract/live-buses.ts";

export { classifyDomainError } from "./error-mapping.ts";
export { createLiveBuses } from "./live-buses.ts";
export type { PresenceRegistry } from "./presence-registry.ts";
export { createPresenceRegistry } from "./presence-registry.ts";
export type { AppRouter } from "./router.ts";
export { appRouter, createCaller } from "./router.ts";

export type { SocketRegistry } from "./stream/socket-registry.ts";
export { createSocketRegistry } from "./stream/socket-registry.ts";
