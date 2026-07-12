// verb: resolveGifSearchKey — resolve the ACTING principal's Tenor gif-search API key (D61 gallery-design
// §5). The NON-LLM external-service credential path: unlike the turn-time `resolve` (which mints a
// brand-protected `ResolvedCredential` for a runner), this returns the RAW decrypted key string the
// `domain/hub` gif adapter passes as a query param to Tenor.
//
// Security:
//   • OWNER-SCOPED — reads only the ACTING `principal.userId`'s active `gif-search` row (the cross-tenant
//     invariant: user B can never resolve user A's key). No host/owner fallback — a user without their own
//     gif-search credential gets `null` (the hub verb surfaces "gif search not configured"), never someone
//     else's key.
//   • `gif-search` has its OWN provider slot → its own AAD (`${ownerId}|gif-search`); a row lifted from
//     another slot fails GCM auth and reads as absent (`decryptSealed` → null).
//   • NEVER logs the key (decryptSealed logs only a redacted error on failure).

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
