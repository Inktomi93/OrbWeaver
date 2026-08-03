// verb: loadAssetBytes — the embeddings indexer's canon re-reader for the image lenses. UN-PRINCIPAL by
// design (D20): the vector substrate carries NO `ownerId`, so the indexer (a trusted SYSTEM consumer, never a
// user-facing surface) re-reads the blob by the branded id the `asset.created` event carried, with NO owner
// gate. The deliberate exception to assets' "every surface is owner-scoped off principal.userId" (D21) —
// there is no principal here; the row's `ownerId` is read FROM the row only to key the per-user CAS (the
// physical store is sharded by owner). NOT a security hole: a trusted internal re-read, wired only into the
// embeddings indexer at the composition root, never exposed on the blob-serve route.
//
// Returns the asset's CAS bytes, or `null` when the asset ROW is gone (deleted between the emit and the
// handler). A present row whose blob is missing is an INTEGRITY fault (the row↔blob coherence pair has one
// writer, `storeBlob`) — `cas.read` rejects (ENOENT) and we let it throw loud, never swallow it (null is
// strictly "no asset row").

import type { AssetId } from "@orb/kit/ids";
import type { AssetsContext } from "../context.ts";
import type { AssetsService } from "../contract/service.ts";
import { loadAssetCasRefById } from "../persistence/queries.ts";

export function createLoadAssetBytes(ctx: AssetsContext): AssetsService["loadAssetBytes"] {
  return async (assetId: AssetId): Promise<Uint8Array | null> => {
    const ref = await loadAssetCasRefById(ctx.db, assetId);
    if (ref === undefined) {
      return null;
    }
    return ctx.cas.read(ref.ownerId, ref.hash);
  };
}
