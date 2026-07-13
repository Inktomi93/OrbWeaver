// domain/credentials/contract/views — the credential read-model. CredentialView never carries a secret
// field (ciphertext/iv/tag) or the plaintext key; toCredentialView in persistence/queries.ts is the only
// projection that produces it. Domain-internal (client gets it by tRPC inference, not a deep import).

import type { CredentialProvider } from "@orb/contracts/credentials";
import type { UserCredentialId } from "@orb/kit/ids";

export interface CredentialView {
  readonly id: UserCredentialId;
  readonly provider: CredentialProvider;
  /** Nullable at the column; add always writes one (default "default"). */
  readonly label: string | null;
  readonly active: boolean;
  readonly hasMetadata: boolean;
  readonly revokedAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
