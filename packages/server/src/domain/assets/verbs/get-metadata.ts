// verb: getMetadata — the blob-serve gate. Returns {mime,size} of an asset the caller can view, or
// undefined (→ 404) when it doesn't exist or isn't accessible (the two collapse — no foreign-existence
// leak). Normal path: owner-scoped off principal.userId; falls back to loadCoParticipantOwner (roster-
// avatar reference-check) only if the hash is a co-participant's rostered avatar or active persona, never a
// bare hash match — on a hit, that asset owner's ownerId is returned so the blob route reads the right CAS partition.

import type { AssetsContext } from "../context";
import type { GetMetadataParams } from "../contract/params";
import type { AssetMetadata } from "../contract/results";
import type { AssetsService } from "../contract/service";
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
