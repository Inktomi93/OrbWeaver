// verb: assetCasRefById — resolve an asset's `(ownerId, hash)` CAS coordinates from its ROW ID alone.
// UN-PRINCIPAL by design (D20 — the `loadAssetBytes` posture): a pure coordinate lookup that returns NO
// bytes and applies NO owner gate. Its one caller is the chat image-resolution seam (`resolveImageUrl`),
// which turns a canon `asset:<id>` ref into the content hash that `getMetadata` needs — and `getMetadata`
// (owner-scope + the PD-28 co-participant fallback) is the actual permission gate. Compose-root-internal;
// never routed to a user-facing surface. `undefined` when the row is gone.

import type { AssetId } from "@orb/kit/ids";
import type { AssetCasRef } from "../contract/results";
import type { AssetsContext, AssetsService } from "../contract/service";
import { loadAssetCasRefById } from "../persistence/queries";

export function createAssetCasRefById(ctx: AssetsContext): AssetsService["assetCasRefById"] {
  return (assetId: AssetId): Promise<AssetCasRef | undefined> =>
    loadAssetCasRefById(ctx.db, assetId);
}
