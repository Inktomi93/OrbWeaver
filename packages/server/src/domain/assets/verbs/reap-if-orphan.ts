// verb: reapIfOrphan — targeted, NO-grace reap of a KNOWN id set (PD-26). The caller (`character.remove` /
// bulk-remove) has JUST deleted these assets' references and proved they're gone, so — unlike
// `collectGarbage`'s whole-CAS sweep — no grace window is needed: an id still referenced by ANY registry
// column (a second character's avatar, a gallery curation) is left alone; an id referenced by NOTHING is
// purged drop-row-BEFORE-blob. UN-PRINCIPAL (D20 posture): a trusted cleanup port, not a user-facing surface.

import type { AssetsContext } from "../context";
import type { AssetsService } from "../contract/service";
import { selectReferencedAmong } from "../persistence/asset-refs";
import { loadAssetCasRefById } from "../persistence/queries";
import { purgeAsset } from "../substrate/purge-asset";

export function createReapIfOrphan(ctx: AssetsContext): AssetsService["reapIfOrphan"] {
  return async (assetIds) => {
    const referenced = await selectReferencedAmong(ctx.db, assetIds);
    let reaped = 0;
    for (const assetId of assetIds) {
      if (referenced.has(assetId)) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: per-asset drop-row-BEFORE-blob sequencing is DELIBERATE — batching all rows then all blobs widens the row-without-blob window (the invariant this verb protects).
      const ref = await loadAssetCasRefById(ctx.db, assetId);
      if (ref === undefined) {
        continue; // already gone (a concurrent reap / the cascade beat us) — nothing to do.
      }
      // biome-ignore lint/performance/noAwaitInLoops: same per-asset sequencing invariant as above.
      await purgeAsset({
        db: ctx.db,
        cas: ctx.cas,
        variants: ctx.variants,
        assetId,
        ownerId: ref.ownerId,
        hash: ref.hash,
      });
      reaped++;
    }
    return { checked: assetIds.length, reaped };
  };
}
