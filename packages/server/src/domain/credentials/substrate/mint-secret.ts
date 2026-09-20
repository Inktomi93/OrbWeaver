// The single construction home for the brand-protected `ResolvedSecret` — the brand's only legal cast site.
// Lives in `substrate/` (not a verb) so `resolve` and any future saved-row diagnostic share it without a
// cross-verb import. The cast is object-literal → branded intersection (not `as unknown as`) — the brand's
// sanctioned escape hatch, kept narrow and single-sited.

import type { ResolvedSecret, ResolvedSecretKind } from "@orb/contracts/credentials";
import type { UserCredentialId } from "@orb/kit/ids";

/** Mint a decrypted secret. `credentialId` is `null` and `kind` is `none` exactly together (the keyless arm). */
export function mintSecret(
  args:
    | { readonly credentialId: UserCredentialId; readonly kind: Exclude<ResolvedSecretKind, "none">; readonly secret: string }
    | { readonly credentialId: null; readonly kind: "none"; readonly secret: null },
): ResolvedSecret {
  return { credentialId: args.credentialId, kind: args.kind, secret: args.secret } as ResolvedSecret;
}
