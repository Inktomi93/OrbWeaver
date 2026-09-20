// domain/credentials/contract/views — the credential read-model. CredentialView never carries a secret
// field (ciphertext/iv/tag) or the plaintext key; toCredentialView in persistence/queries.ts is the only
// projection that produces it. Domain-internal (client gets it by tRPC inference, not a deep import).

import type { CredRevokedReason } from "@orb/contracts/credentials";
import type { ProviderId } from "@orb/contracts/inference";
import type { UserCredentialId } from "@orb/kit/ids";

export interface CredentialView {
  readonly id: UserCredentialId;
  /** The provider REGISTRY id the key was sealed for (half the AAD). */
  readonly provider: ProviderId;
  /** Nullable at the column; add always writes one (default "default"). */
  readonly label: string | null;
  readonly hasMetadata: boolean;
  readonly revokedAt: number | null;
  /** WHY it was revoked, so the Connections pane can say which of the three things happened instead of a
   *  bare Revoked chip. Non-null exactly when `revokedAt` is (both are written in one statement and cleared
   *  together) — a null here on a revoked row means a writer bypassed `setRevokedById`, and the surface
   *  renders NOTHING rather than guessing a cause. */
  readonly revokedReason: CredRevokedReason | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The DEPLOYMENT's credential-storage capability (`storageStatus`) — `false` when no `CREDENTIALS_KEY` is
 *  configured, in which case every write verb refuses (`credentials_disabled`) and the UI must refuse the
 *  INPUT rather than collect a live secret into a form that cannot keep it. An object, not a bare boolean, so
 *  a future reason/remedy field is additive. */
export interface CredentialStorageStatus {
  readonly enabled: boolean;
}
