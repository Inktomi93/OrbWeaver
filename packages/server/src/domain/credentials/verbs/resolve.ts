// verb: resolve — the turn-time credential chokepoint, BY ID off the connection row (inference program §5.3).
// Returns a brand-protected `ResolvedSecret` built only through `substrate/mint-secret`. A `null` credentialId
// is the keyless arm (`auth: none`, an open endpoint); a missing / foreign / revoked row is
// `DomainNoCredentialError` with no silent fallback (the connection reads `no-connection` at send until
// re-keyed). WHAT KIND of secret the row holds comes from its metadata's `auth` discriminator — `apiKey`,
// `oauthToken` (a pasted `claude setup-token`) or `endpoint` (the optional bearer) — never from the provider.

import type { ResolvedSecret, ResolvedSecretKind } from "@orb/contracts/credentials";
import { parseProviderMetadata } from "@orb/contracts/credentials";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { CredentialContext } from "../context.ts";
import type { ResolveCredentialParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { aadFor } from "../persistence/aad.ts";
import { fetchOwnedCredential } from "../persistence/queries.ts";
import { decryptSealed } from "../substrate/decrypt.ts";
import { mintSecret } from "../substrate/mint-secret.ts";

/** The metadata `auth` arm → the secret kind. A row with no metadata (every pre-metadata key) is an API key. */
function kindOf(metadata: unknown): Exclude<ResolvedSecretKind, "none"> {
  const parsed = parseProviderMetadata(metadata);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap — biome collapses discriminatedUnion(...).nullable() and drops the null arm; `parsed` IS nullable (its declared return type) and the contract test asserts the null return for a bad/retired shape.
  if (parsed === null || parsed.auth === "apiKey") {
    return "apiKey";
  }
  if (parsed.auth === "oauthToken") {
    return "oauthToken";
  }
  return "bearer";
}

export function createResolve(ctx: CredentialContext): CredentialsService["resolve"] {
  return async (params: ResolveCredentialParams): Promise<ResolvedSecret> => {
    const { ownerId, credentialId, providerId } = params;
    if (credentialId === null) {
      return mintSecret({ credentialId: null, kind: "none", secret: null });
    }
    const row = await fetchOwnedCredential(ctx.db, ownerId, credentialId);
    if (row === undefined || row.revokedAt !== null) {
      throw new DomainNoCredentialError(providerId);
    }
    // The AAD is `${owner}|${providerId}` — a row sealed under another provider id (or lifted to another
    // owner) decrypt-fails as the typed configuration error, never as a wrong key on the wire.
    const plaintext = decryptSealed(ctx.box, row, aadFor(ownerId, providerId));
    return mintSecret({ credentialId: row.id, kind: kindOf(row.metadata), secret: plaintext });
  };
}
