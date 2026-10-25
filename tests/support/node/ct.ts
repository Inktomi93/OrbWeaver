// The Playwright door for component specs: network interception and section navigation on the Node side.

export { holdCorpusProcedure, serveCorpusProcedures } from "./ct-corpus-procedures.ts";
export { createShellAmbientReads } from "./ct-shell-reads.ts";
export { HOST_BAND, openContextSections } from "./open-context-sections.ts";
export { routeOrbSocket } from "./route-orb-socket.ts";
export type { TrpcInput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "./route-trpc.ts";
export { routeTrpc, trpcError, trpcHold } from "./route-trpc.ts";
