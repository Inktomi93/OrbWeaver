// verb: getMetadata — the blob-serve gate (D21). Returns the `{mime,size}` of an asset the CALLER
// has permission to view, or `undefined` (→ 404) when it doesn't exist OR isn't accessible (the two
// collapse — no foreign-existence leak). Normal path: owner-scoped off `principal.userId`.
//
// PD-28 / D21 — roster-avatar REFERENCE-CHECK (NOT a hash→any-owner oracle, PD-107): if the owner-scoped
// lookup misses AND the context supplies a `loadCoParticipantOwner` op, we fall back to it. That op returns
// an owner ONLY IF the hash is the `avatarAssetId` of EITHER a CHARACTER rostered in a chat the caller is a
// present member of, OR a PERSONA that is a co-participant HUMAN's current `activePersonaId` in a chat the
// caller is ALSO a present member of (the multi-human group sibling case — see the op's wiring comment,
// `entry/compose/services.ts`) — never a bare co-participant hash match, so a co-participant's non-avatar
// asset yields nothing here. On a hit, that ASSET owner's `ownerId` is returned with the metadata so the
// blob route reads from the correct per-user CAS partition. No path is constructed here (a pure hash
// lookup), so no `isAssetHash` guard is needed — a non-hash simply matches no row.

import type { GetMetadataParams } from "../contract/params";
import type { AssetMetadata } from "../contract/results";
import type { AssetsContext, AssetsService } from "../contract/service";
import { metadataForOwnedHash, metadataForOwnerAndHash } from "../persistence/queries";

export function createGetMetadata(ctx: AssetsContext): AssetsService["getMetadata"] {
  return ({ principal, hash }: GetMetadataParams): Promise<AssetMetadata | undefined> =>
    getMetadata(ctx, principal, hash);
}

async function getMetadata(
  ctx: AssetsContext,
  principal: GetMetadataParams["principal"],
  hash: string,
): Promise<AssetMetadata | undefined> {
  const owned = await metadataForOwnedHash(ctx.db, principal.userId, hash);
  if (owned !== undefined) {
    return owned;
  }

  if (ctx.loadCoParticipantOwner !== undefined) {
    const coOwnerId = await ctx.loadCoParticipantOwner(principal.userId, hash);
    if (coOwnerId !== undefined) {
      const coMeta = await metadataForOwnerAndHash(ctx.db, coOwnerId, hash);
      if (coMeta !== undefined) {
        return { mime: coMeta.mime, size: coMeta.size, ownerId: coOwnerId };
      }
    }
  }

  return undefined as AssetMetadata | undefined;
}
