// The Playwright door for component specs: network interception and section navigation on the Node side.

export { emulateSoftKeyboard } from "@orb/tooling/floor/browser/soft-keyboard";
export { channelName } from "./appearance-channel-name.ts";
export type { HeldCorpusProcedure, HeldThenFailing, ServedHold } from "./ct-corpus-procedures.ts";
export { heldThenFailing, holdCorpusProcedure, holdServed, serveCorpusProcedures } from "./ct-corpus-procedures.ts";
export { ROOM_PROCEDURES, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES } from "./ct-shell-procedures.ts";
export { createShellAmbientReads } from "./ct-shell-reads.ts";
export { HOST_BAND, openContextSections } from "./open-context-sections.ts";
export { routeAuthConfig } from "./route-auth-config.ts";
export { routeOrbSocket } from "./route-orb-socket.ts";
export type { TrpcInput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "./route-trpc.ts";
export { defineTrpcRoutes, routeTrpc, trpcError, trpcHold } from "./route-trpc.ts";
export { SECTION_LABELS } from "./section-labels.ts";
export type { SurfaceAuditRequest } from "./surface-audit.ts";
