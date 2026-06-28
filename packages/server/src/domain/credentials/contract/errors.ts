// domain/credentials/contract/errors — the typed domain errors (credentials.md §"The 8-slot layout").
// One home for the credential reason strings (no inline re-spell, §7.5).
//
// ⚠️ HTTP-400 ASYMMETRY (deliberate — credentials.md movement table + invariant): `CredentialsNotFoundError`
// extends `DomainOperationError`, so the transport maps it to BAD_REQUEST (400) with `code:
// 'credential_not_found'` — NOT the NOT_FOUND (404) that `DomainNotFoundError` entity verbs produce. The
// not-owned and not-found cases COLLAPSE on purpose: a 404 would leak that the row exists for someone
// else. Clients key on the `code` discriminator, never the HTTP status.

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";

/** The `DomainOperationError.code` discriminators credential verbs throw. One home for the reason strings. */
export const CREDENTIALS_OP_CODES = {
  /** A row that does not exist OR is not owned by the caller (the two collapse — no existence leak). */
  notFound: "credential_not_found",
  /** Per-user credential storage is off (no `CREDENTIALS_KEY` → the injected `SecretBox` is disabled). */
  disabled: "credentials_disabled",
  /** A stored row's `metadata` failed the read-seam parse (e.g. `custom_openai` missing its `baseUrl`). */
  metadataInvalid: "credential_metadata_invalid",
} as const;

/** The reason-code union (derived from the one tuple of values — never re-spelled). */
export type CredentialsOpCode = (typeof CREDENTIALS_OP_CODES)[keyof typeof CREDENTIALS_OP_CODES];

/**
 * "This credential row doesn't exist or isn't owned by this caller." Thrown by every per-credential verb
 * (setActive / remove / mark-revoked-by-user / clear-revoked / test-health / inspect-endpoint) when the
 * id fails the owner-scoped load. HTTP 400 (see the file header) — the discriminator is the `code`.
 */
export class CredentialsNotFoundError extends DomainOperationError {
  declare readonly code: typeof CREDENTIALS_OP_CODES.notFound;
  constructor(credentialId: string) {
    super(CREDENTIALS_OP_CODES.notFound, `credential ${credentialId} not found`);
  }
}

/**
 * A uniqueness conflict on `user_credentials` — the TOCTOU loser of two concurrent first-adds for the
 * same `(owner, provider)` slot (both pass the SELECT, the loser collides on the partial active-unique
 * index). Maps to CONFLICT (409): the winner's insert succeeded, so "already exists — refresh and retry"
 * is the honest signal, not a raw 500.
 */
export class CredentialsConflictError extends DomainConflictError {}
