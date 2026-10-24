// verb: getMetadata — the blob-serve gate: {mime,size} of a viewable asset, else undefined (404; missing and foreign collapse).
// Owner-scoped first, then loadCoParticipantOwner: a co-participant's rostered avatar, active persona, or a room-linked
// attachment at or above the caller's history floor, never a bare hash; a hit returns that owner's CAS partition.

import type { GetMetadataParams } from "../contract/params.ts";
import type { AssetMetadata } from "../contract/results.ts";
import type { AssetsContext, AssetsService } from "../contract/service.ts";
import { metadataForOwnedHash, metadataForOwnerAndHash } from "../persistence/queries.ts";

export function createGetMetadata(ctx: AssetsContext): AssetsService["getMetadata"] {
  return ({ principal, hash }: GetMetadataParams): Promise<AssetMetadata | undefined> => getMetadata(ctx, principal, hash);
}

async function getMetadata(ctx: AssetsContext, principal: GetMetadataParams["principal"], hash: string): Promise<AssetMetadata | undefined> {
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
