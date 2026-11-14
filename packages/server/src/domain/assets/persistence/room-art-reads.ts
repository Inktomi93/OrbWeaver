// The asset reads behind chat's co-participant art gate: owner and render ref by hash or by id, with no owner term.
// They exist to RESOLVE the owner the gate then tests against the caller's rooms, so an owner term would be circular
// (the `loadAssetCasRefById` precedent, D20). Compose wires them only into that gate; no user-facing door calls them.

import type { AssetBlobRefHolder } from "@orb/contracts/assets";
import { assets } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, UserId } from "@orb/kit/ids";
import { eq, inArray } from "drizzle-orm";

/** Each asset row holding the bytes `hash` names, mapped to its owner. */
export function createLoadHashHolders(handle: DatabaseHandle): (hash: string) => Promise<ReadonlyMap<AssetId, UserId>> {
  const db = databaseForOwner(handle);
  return async (hash) => {
    const rows = await db.select({ id: assets.id, ownerId: assets.ownerId }).from(assets).where(eq(assets.hash, hash));
    return new Map(rows.map((row) => [row.id, row.ownerId]));
  };
}

/** The render ref and owner of each of `assetIds` that exists; a missing id is absent. */
export function createLoadAssetRefHolders(handle: DatabaseHandle): (assetIds: readonly AssetId[]) => Promise<ReadonlyMap<AssetId, AssetBlobRefHolder>> {
  const db = databaseForOwner(handle);
  return async (assetIds) => {
    if (assetIds.length === 0) {
      return new Map<AssetId, AssetBlobRefHolder>();
    }
    const rows = await db
      .select({ assetId: assets.id, hash: assets.hash, mime: assets.mime, width: assets.width, height: assets.height, ownerId: assets.ownerId })
      .from(assets)
      .where(inArray(assets.id, [...assetIds]));
    return new Map<AssetId, AssetBlobRefHolder>(rows.map(({ ownerId, ...ref }) => [ref.assetId, { ref, ownerId }]));
  };
}
