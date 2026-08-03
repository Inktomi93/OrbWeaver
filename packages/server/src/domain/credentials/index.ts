// domain/credentials — FRONT DOOR: the only legal external import. Cross-boundary types (ResolvedCredential,
// CredentialHealth, ProviderMetadata, CredentialProvider, CredentialSource) live in @orb/contracts/credentials;
// callers import them from there directly, not through this front door.

export type { CredentialContext } from "./context.ts";
export { CREDENTIALS_OP_CODES, CredentialsConflictError, CredentialsNotFoundError } from "./contract/errors.ts";
export type { CredentialsService } from "./contract/service.ts";
export type { CredentialView } from "./contract/views.ts";
export { createCredentialsService } from "./service.ts";
