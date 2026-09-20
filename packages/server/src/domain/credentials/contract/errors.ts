// domain/credentials/contract/errors — the typed domain errors.
// CredentialsNotFoundError maps to 400, not 404: not-owned and not-found collapse on purpose so a 404
// never leaks that the row exists for someone else — clients key on `code`, never HTTP status.

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import type { UserCredentialId } from "@orb/kit/ids";
import { redactKnownSecrets } from "@orb/kit/secret-redaction";

const DECRYPT_GUIDANCE = "Stored credential cannot be decrypted. Restore the matching CREDENTIALS_KEY or replace the saved credential.";

export const CREDENTIALS_OP_CODES = {
  notFound: "credential_not_found",
  disabled: "credentials_disabled",
  metadataInvalid: "credential_metadata_invalid",
  decryptFailed: "credential_decrypt_failed",
  providerUnknown: "credential_provider_unknown",
} as const;

/** Stored ciphertext cannot be opened under this deployment's key/configuration. This is distinct from a
 *  missing credential and permanently non-retryable until an operator restores the key or replaces the row.
 *  The constructor accepts the sealed literals only to scrub accidental short/overlapping appearances from
 *  its fixed guidance; it retains neither those bytes nor the raw crypto cause. */
export class CredentialsDecryptError extends DomainOperationError {
  declare readonly code: typeof CREDENTIALS_OP_CODES.decryptFailed;
  readonly retryable = false;

  constructor(sealedLiterals: readonly string[]) {
    super(CREDENTIALS_OP_CODES.decryptFailed, redactKnownSecrets(DECRYPT_GUIDANCE, sealedLiterals));
  }
}

export class CredentialsNotFoundError extends DomainOperationError {
  declare readonly code: typeof CREDENTIALS_OP_CODES.notFound;
  constructor(credentialId: UserCredentialId) {
    super(CREDENTIALS_OP_CODES.notFound, `credential ${credentialId} not found`);
  }
}

/** TOCTOU loser of two concurrent first-adds for the same (owner, provider) slot; maps to 409. */
export class CredentialsConflictError extends DomainConflictError {}
