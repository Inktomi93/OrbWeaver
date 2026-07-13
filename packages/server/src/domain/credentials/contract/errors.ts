// domain/credentials/contract/errors — the typed domain errors.
// CredentialsNotFoundError maps to 400, not 404: not-owned and not-found collapse on purpose so a 404
// never leaks that the row exists for someone else — clients key on `code`, never HTTP status.

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import type { UserCredentialId } from "@orb/kit/ids";

export const CREDENTIALS_OP_CODES = {
  notFound: "credential_not_found",
  disabled: "credentials_disabled",
  metadataInvalid: "credential_metadata_invalid",
} as const;

export type CredentialsOpCode = (typeof CREDENTIALS_OP_CODES)[keyof typeof CREDENTIALS_OP_CODES];

export class CredentialsNotFoundError extends DomainOperationError {
  declare readonly code: typeof CREDENTIALS_OP_CODES.notFound;
  constructor(credentialId: UserCredentialId) {
    super(CREDENTIALS_OP_CODES.notFound, `credential ${credentialId} not found`);
  }
}

/** TOCTOU loser of two concurrent first-adds for the same (owner, provider) slot; maps to 409. */
export class CredentialsConflictError extends DomainConflictError {}
