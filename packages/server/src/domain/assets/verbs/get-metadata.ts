// verb: getMetadata — the blob-serve gate (D21). Returns the `{mime,size}` of an asset the CALLER
// has permission to view, or `undefined` (→ 404) when it doesn't exist OR isn't accessible (the two
// collapse — no foreign-existence leak). Normal path: owner-scoped off `principal.userId`.
//
// PD-28 — roster-avatar membership exception: if the owner-scoped lookup misses AND the context
// supplies a `loadCoParticipantOwner` op, we fall back to checking whether any co-participant owns
// the hash. If so, their `ownerId` is returned alongside the metadata so the blob route reads from
// the correct per-user CAS partition. No path is constructed here (a pure hash lookup), so no
// `isAssetHash` guard is needed — a non-hash simply matches no row.

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
  // 1. Happy path: caller owns the blob.
  const owned = await metadataForOwnedHash(ctx.db, principal.userId, hash);
  if (owned !== undefined) {
    return owned;
  }

  // 2. PD-28 roster-avatar exception: caller is a co-participant of the owner.
  if (ctx.loadCoParticipantOwner !== undefined) {
    const coOwnerId = await ctx.loadCoParticipantOwner(principal.userId, hash);
    if (coOwnerId !== undefined) {
      const coMeta = await metadataForOwnerAndHash(ctx.db, coOwnerId, hash);
      // Carry ownerId so the blob route reads from the correct CAS partition.
      if (coMeta !== undefined) {
        return { mime: coMeta.mime, size: coMeta.size, ownerId: coOwnerId };
      }
    }
  }

  // Not found / not accessible — collapse both to undefined (no foreign-existence leak).
  return undefined as AssetMetadata | undefined;
}
