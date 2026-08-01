// Front door for the non-tRPC route registrars; app.ts mounts each register<X> on the shared Hono app.

export type { AuthMetaDeps } from "./auth-meta";
export { registerAuthMeta } from "./auth-meta";
export type {
  AuthRoutesDeps,
  AuthSessionsPort,
  LocalAuthenticator,
  OidcClaimMap,
  OidcMintStore,
  OidcRoutesDeps,
} from "./auth-routes";
export {
  deriveRedirectUri,
  identityFromClaims,
  registerAuthRoutes,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from "./auth-routes";
export type { BlobAssetsPort, BlobCasPort, BlobDeps } from "./blob";
export { registerBlob } from "./blob";
export type { ExportDeps } from "./export";
export { registerExport } from "./export";
export type { HealthzDeps } from "./healthz";
export { registerHealthz } from "./healthz";

export type { ImportBundleDeps } from "./import";
export { registerImportBundle } from "./import";
export type { ChatImportResult, ImportChatDeps } from "./import-chat";
export { registerImportChat } from "./import-chat";
export type { ImportTreeDeps } from "./import-tree";
export { registerImportTree } from "./import-tree";
export type { JoinDeps } from "./join";
export { registerJoin } from "./join";
export { securityHeaders } from "./security-headers";
export type { SpaDeps } from "./spa";
export { registerSpa, resolveSpaDistDir } from "./spa";
export type { UploadAssetsPort, UploadDeps } from "./upload";
export { registerUpload } from "./upload";
