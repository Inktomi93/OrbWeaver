// The asset reads behind chat's co-participant art gate: owner and render ref by hash or by id. Neither takes the
// caller as an owner term: they exist to RESOLVE the owner the gate then tests against the caller's rooms, so that term
// would be circular (the `loadAssetCasRefById` precedent, D20). Each answers only for what the gate's room read names.
// Compose wires them only into that gate; no user-facing door calls them.

import type { AssetBlobRefHolder, HashHolderScope } from "@orb/contracts/assets";
import { assets } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, or } from "drizzle-orm";

/** Each asset row holding the bytes `hash` names whose owner is one of `among.ownerIds` or whose id is one of
 *  `among.assetIds`, mapped to its owner. */
export function createLoadHashHolders(handle: DatabaseHandle): (hash: string, among: HashHolderScope) => Promise<ReadonlyMap<AssetId, UserId>> {
  const db = databaseForOwner(handle);
  return async (hash, among) => {
    const rows = await db
      .select({ id: assets.id, ownerId: assets.ownerId })
      .from(assets)
      .where(and(eq(assets.hash, hash), or(inArray(assets.ownerId, [...among.ownerIds]), inArray(assets.id, [...among.assetIds]))));
    return new Map<AssetId, UserId>(rows.map((row) => [row.id, row.ownerId]));
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
