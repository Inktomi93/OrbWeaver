// verb: reapIfOrphan — targeted, NO-grace reap of a KNOWN id set. The caller (`character.remove` /
// bulk-remove) has JUST deleted these assets' references and proved they're gone, so — unlike
// `collectGarbage`'s whole-CAS sweep — no grace window is needed: an id still referenced by ANY registry
// column (a second character's avatar, a gallery curation) is left alone; an id referenced by NOTHING is
// purged drop-row-BEFORE-blob. UN-PRINCIPAL (D20 posture): a trusted cleanup port, not a user-facing surface.

import type { AssetsContext } from "../context.ts";
import type { AssetsService } from "../contract/service.ts";
import { selectReferencedAmong } from "../persistence/asset-refs.ts";
import { loadAssetCasRefById } from "../persistence/queries.ts";
import { purgeAsset } from "../substrate/purge-asset.ts";

export function createReapIfOrphan(ctx: AssetsContext): AssetsService["reapIfOrphan"] {
  return async (assetIds) => {
    const referenced = await selectReferencedAmong(ctx.db, assetIds);
    let reaped = 0;
    for (const assetId of assetIds) {
      if (referenced.has(assetId)) {
        continue;
      }
      const ref = await loadAssetCasRefById(ctx.db, assetId);
      if (ref === undefined) {
        continue; // already gone (a concurrent reap / the cascade beat us) — nothing to do.
      }
      const purged = await purgeAsset({
        db: ctx.db,
        cas: ctx.cas,
        variants: ctx.variants,
        assetId,
        ownerId: ref.ownerId,
        hash: ref.hash,
      });
      if (purged) {
        reaped++;
      }
    }
    return { checked: assetIds.length, reaped };
  };
}
