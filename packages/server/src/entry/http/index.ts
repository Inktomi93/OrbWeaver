// Front door for the non-tRPC route registrars; app.ts mounts each register<X> on the shared Hono app.

export type { AuthMetaDeps } from "./auth-meta.ts";
export { registerAuthMeta } from "./auth-meta.ts";
export type {
  AuthRoutesDeps,
  AuthSessionsPort,
  FirstRunRouteDeps,
  LocalAuthenticator,
  OidcClaimMap,
  OidcMintStore,
  OidcRoutesDeps,
  SessionSocketEviction,
} from "./auth-routes.ts";
export {
  deriveRedirectUri,
  identityFromClaims,
  oidcSessionIdentity,
  registerAuthRoutes,
  serializeClearedSessionCookies,
  serializeSessionCookie,
} from "./auth-routes.ts";
export type { BlobAssetsPort, BlobCasPort, BlobDeps, PrincipalEnv } from "./blob.ts";
export { registerBlob } from "./blob.ts";
export type { CardFrameDeps, CardFrameParticipantsPort } from "./card-frame.ts";
export { registerCardFrame } from "./card-frame.ts";
export type { ExportDeps } from "./export.ts";
export { registerExport } from "./export.ts";
export type { HealthzDeps } from "./healthz.ts";
export { registerHealthz } from "./healthz.ts";

export type { ImportBundleDeps } from "./import.ts";
export { registerImportBundle } from "./import.ts";
export type { ChatImportResult, ImportChatDeps } from "./import-chat.ts";
export { registerImportChat } from "./import-chat.ts";
export type { ImportTreeDeps } from "./import-tree.ts";
export { registerImportTree } from "./import-tree.ts";
export type { JoinDeps } from "./join.ts";
export { registerJoin } from "./join.ts";
export type { PluginFrameDeps, PluginFrameSurfacePort } from "./plugin-frame.ts";
export { registerPluginFrame } from "./plugin-frame.ts";
export type { PluginUiPort } from "./plugin-ui.ts";
export { registerPluginUi } from "./plugin-ui.ts";
export { normalizeThrownErrors, securityHeaders } from "./security-headers.ts";
export type { SpaDeps } from "./spa.ts";
export { registerSpa, resolveSpaDistDir } from "./spa.ts";
export type { UploadAssetsPort, UploadDeps } from "./upload.ts";
export { registerUpload } from "./upload.ts";
