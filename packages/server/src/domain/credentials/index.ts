// domain/credentials — FRONT DOOR: the only legal external import. Cross-boundary types (ResolvedSecret,
// CredentialHealth, ProviderMetadata) live in @orb/contracts/credentials;
// callers import them from there directly, not through this front door.

export { CREDENTIALS_OP_CODES, CredentialsConflictError, CredentialsDecryptError, CredentialsNotFoundError } from "./contract/errors.ts";
export type { CredentialAssemblyContext as CredentialContext, CredentialsService } from "./contract/service.ts";
export type { CredentialView } from "./contract/views.ts";
export { credentialStorageStatusSchema } from "./contract/views.ts";
export { createCredentialOwned } from "./persistence/owned.ts";
export { createCredentialsService } from "./service.ts";
