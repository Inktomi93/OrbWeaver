// domain/credentials — FRONT DOOR: the only legal external import. Cross-boundary types (ResolvedSecret,
// CredentialHealth, ProviderMetadata) live in @orb/contracts/credentials;
// callers import them from there directly, not through this front door.

export { CREDENTIALS_OP_CODES } from "./contract/errors.ts";
export type { CredentialsService } from "./contract/service.ts";
export { createCredentialOwned } from "./persistence/owned.ts";
export { createCredentialsService } from "./service.ts";
export { createCredentialHealthThrottle } from "./substrate/health-throttle.ts";
