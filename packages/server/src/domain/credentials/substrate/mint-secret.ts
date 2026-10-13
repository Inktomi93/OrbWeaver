// The single construction home for the brand-protected decrypted authority.

import type { CredentialExecutionEvidence, ResolvedSecret, ResolvedSecretKind } from "@orb/contracts/credentials";

/** Mint only after credential ownership and AAD verification. */
export function mintSecret(
  args:
    | (Extract<CredentialExecutionEvidence, { credentialId: null }> & { readonly kind: "none"; readonly secret: null })
    | (Exclude<CredentialExecutionEvidence, { credentialId: null }> & {
        readonly kind: Exclude<ResolvedSecretKind, "none">;
        readonly secret: string;
      }),
): ResolvedSecret {
  return { ...args } as ResolvedSecret;
}
