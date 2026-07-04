// entry/http — FRONT DOOR for the non-tRPC route registrars (core/Tier-5-Entry.md §layout "http/"). `app.ts`
// mounts each `register<X>` on the shared Hono app; the test mirror imports the registrars + the pure
// cookie helpers from here, never an internal file (the directory-module rule). These compose domain front
// doors + infra + the auth seam — they own no business logic (entry invariant #1).

export type {
  AuthRoutesDeps,
  AuthSessionsPort,
  LocalAuthenticator,
  OidcMintStore,
  OidcRoutesDeps,
} from "./auth-routes";
export {
  registerAuthRoutes,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "./auth-routes";
export type { BlobAssetsPort, BlobCasPort, BlobDeps } from "./blob";
export { registerBlob } from "./blob";
export type { HealthzDeps } from "./healthz";
export { registerHealthz } from "./healthz";
export { securityHeaders } from "./security-headers";
export type { UploadAssetsPort, UploadDeps } from "./upload";
export { registerUpload } from "./upload";
