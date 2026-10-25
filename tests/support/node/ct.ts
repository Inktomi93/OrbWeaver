// The Playwright door for component specs: network interception and section navigation on the Node side.

export type { ServedHold } from "./ct-corpus-procedures.ts";
export { holdCorpusProcedure, holdServed, serveCorpusProcedures } from "./ct-corpus-procedures.ts";
export { ROOM_PROCEDURES, SECTION_PROCEDURES } from "./ct-shell-procedures.ts";
export { createShellAmbientReads } from "./ct-shell-reads.ts";
export { HOST_BAND, openContextSections } from "./open-context-sections.ts";
export type { TrpcInput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "./route-trpc.ts";
export { defineTrpcRoutes, routeTrpc, trpcError, trpcHold } from "./route-trpc.ts";
export { SECTION_LABELS } from "./section-labels.ts";
