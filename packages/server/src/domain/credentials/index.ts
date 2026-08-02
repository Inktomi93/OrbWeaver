// domain/credentials — FRONT DOOR: the only legal external import. Cross-boundary types (ResolvedCredential,
// CredentialHealth, ProviderMetadata, CredentialProvider, CredentialSource) live in @orb/contracts/credentials;
// callers import them from there directly, not through this front door.

export type { CredentialContext } from "./context";
export { CREDENTIALS_OP_CODES, CredentialsConflictError, CredentialsNotFoundError } from "./contract/errors";
export type { CredentialsService } from "./contract/service";
export type { CredentialView } from "./contract/views";
export { createCredentialsService } from "./service";
