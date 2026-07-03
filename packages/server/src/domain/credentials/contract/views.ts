// domain/credentials/contract/views — the credential read-model (the plaintext-never-leaks belt).
// `CredentialView` is what the client receives via tRPC service-method-signature inference
// — it NEVER carries a secret field (`ciphertext`/`iv`/`tag`) or the plaintext key. `toCredentialView`
// in `persistence/queries.ts` is the only projection that produces it, so a secret column cannot leak
// into the wire by construction. Domain-internal (client gets it by inference, not a deep import) — it
// stays here, not in `@orb/contracts`.

import type { CredentialProvider } from "@orb/contracts/credentials";
import type { UserCredentialId } from "@orb/kit/ids";

/**
 * A `user_credentials` row as the client sees it. The secret material (`ciphertext`/`iv`/`tag`) and the
 * decrypted key are ABSENT by design (invariant #4 — the plaintext-never-leaks belt lives in the
 * projection, not the verb). `revokedAt` is the revocation marker (`null` = live); orbweaver's schema
 * drops neo's `revokedReason` column, so the reason is a log-only field (see `mark-revoked`), never a
 * view field. `hasMetadata` is the boolean presence of the JSON blob — the blob itself can hold a custom
 * endpoint's `baseUrl`, surfaced through the resolver/inspector, not this list view.
 */
export interface CredentialView {
  readonly id: UserCredentialId;
  readonly provider: CredentialProvider;
  /** User-facing label. Nullable at the column; `add` always writes one (default `"default"`). */
  readonly label: string | null;
  readonly active: boolean;
  readonly hasMetadata: boolean;
  readonly revokedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
