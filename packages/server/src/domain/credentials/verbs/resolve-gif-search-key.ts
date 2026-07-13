// verb: resolveGifSearchKey — resolve the acting principal's Tenor gif-search API key, returning the raw
// decrypted key string (not a brand-protected ResolvedCredential — this is the non-LLM external-service
// path). Owner-scoped: no host/owner fallback, a user without their own credential gets null. gif-search has
// its own AAD provider slot; a row lifted from another slot fails GCM auth and reads as absent.

import type { UserId } from "@orb/kit/ids";
import type { ResolveGifSearchKeyParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
import { aadFor } from "../persistence/aad";
import { loadActiveCredential } from "../persistence/queries";
import { decryptSealed } from "../substrate/decrypt";

const GIF_SEARCH_PROVIDER = "gif-search" as const;

export function createResolveGifSearchKey(
  ctx: CredentialContext,
): CredentialsService["resolveGifSearchKey"] {
  return async (params: ResolveGifSearchKeyParams): Promise<string | null> => {
    const ownerId: UserId = params.principal.userId;
    if (!ctx.box.enabled) {
      return null;
    }
    const active = await loadActiveCredential(ctx.db, ownerId, GIF_SEARCH_PROVIDER);
    if (active === undefined || active.revokedAt !== null) {
      return null;
    }
    const plaintext = decryptSealed(ctx.box, active, aadFor(ownerId, GIF_SEARCH_PROVIDER));
    return plaintext !== null && plaintext.length > 0 ? plaintext : null;
  };
}
