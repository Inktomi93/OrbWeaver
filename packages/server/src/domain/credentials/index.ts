// domain/credentials — FRONT DOOR: the only legal external import (domain-feature-front-door). Re-exports
// the public surface:
//   • the typed errors (CredentialsNotFoundError — HTTP 400; CredentialsConflictError — 409)
//   • the service contract + its DI bundle/deps types (client consumes views via tRPC inference)
//   • CredentialView (the secret-free read-model)
//   • createCredentialsService (the factory the entry root wires)
// The cross-boundary types — ResolvedCredential, CredentialHealth, ProviderMetadata, CredProvider,
// CredentialSource — live in `@orb/contracts/credentials`; callers import them from there directly, NOT
// through this front door (§7.4 — one home, contracts is the cross-boundary node).

export { CredentialsConflictError, CredentialsNotFoundError } from "./contract/errors";
export type {
  CredentialContext,
  CredentialsService,
  CredentialsServiceDeps,
} from "./contract/service";
export type { CredentialView } from "./contract/views";
export { createCredentialsService } from "./service";
