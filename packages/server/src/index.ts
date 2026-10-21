// Native declaration emit publishes this type-only entry for the client. Server implementation and
// request context members stay behind the generated boundary; AppRouter still derives from the router value.
export type { AppRouter } from "./transport/trpc/router.ts";
