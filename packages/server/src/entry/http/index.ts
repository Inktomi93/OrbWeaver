// Front door for the non-tRPC route registrars; app.ts mounts each register<X> on the shared Hono app.

export { registerAuthMeta } from "./auth-meta.ts";
export type {
  AuthSessionsPort,
  FirstRunRouteDeps,
  LocalAuthenticator,
  OidcRoutesDeps,
  SessionSocketEviction,
  SignupRouteDeps,
} from "./auth-routes.ts";
export { ownerClaimLoginUrl, registerAuthRoutes, serializeSessionCookie } from "./auth-routes.ts";
export type { BlobAssetsPort, BlobCasPort } from "./blob.ts";
export { registerBlob } from "./blob.ts";

export { registerCardFrame } from "./card-frame.ts";
export type { PrincipalEnv } from "./contract/request-env.ts";

export { registerExport } from "./export.ts";

export { registerHealthz } from "./healthz.ts";

export { hostAllowlist } from "./host-allowlist.ts";

export { registerImportBundle } from "./import.ts";

export { registerImportChat } from "./import-chat.ts";

export { registerImportTree } from "./import-tree.ts";

export { registerJoin } from "./join.ts";

export { registerPluginFrame } from "./plugin-frame.ts";

export { registerPluginUi } from "./plugin-ui.ts";
export { normalizeThrownErrors, securityHeaders } from "./security-headers.ts";

export { registerSpa, resolveSpaDistDir } from "./spa.ts";
export type { UploadAssetsPort } from "./upload.ts";
export { registerUpload } from "./upload.ts";
