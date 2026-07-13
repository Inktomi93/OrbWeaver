// domain/credentials — FRONT DOOR: the only legal external import. Cross-boundary types (ResolvedCredential,
// CredentialHealth, ProviderMetadata, CredentialProvider, CredentialSource) live in @orb/contracts/credentials;
// callers import them from there directly, not through this front door.

export { CredentialsConflictError, CredentialsNotFoundError } from "./contract/errors";
export type {
  CredentialContext,
  CredentialsService,
  CredentialsServiceDeps,
} from "./contract/service";
export type { CredentialView } from "./contract/views";
export { createCredentialsService } from "./service";
