// asset-kinds: the two reads of `asset_kinds` every domain that asks "is this asset used as kind K" shares. A kind
// belongs to each use of a stored file, so the question is a membership test against the use rows, never a column of
// `assets`.

import type { AssetKind } from "@orb/contracts/assets";
import { ASSET_KINDS } from "@orb/contracts/assets";
import type { AssetId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, inArray, sql } from "drizzle-orm";
import type { Db } from "../client/index.ts";
import { assetKinds, assets } from "../schema/assets.ts";

/** A predicate over the `assets` row in scope: true when the asset is used as one of `kinds`. */
export function assetUsedAs(db: Db, kinds: readonly AssetKind[]): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(assetKinds)
      .where(and(eq(assetKinds.assetId, assets.id), inArray(assetKinds.kind, [...kinds]))),
  );
}

/** Each asset's kinds, in `ASSET_KINDS` order; an id with no row is absent. */
export async function loadAssetKinds(db: Db, assetIds: readonly AssetId[]): Promise<ReadonlyMap<AssetId, readonly AssetKind[]>> {
  if (assetIds.length === 0) {
    return new Map<AssetId, readonly AssetKind[]>();
  }
  const rows = await db
    .select({ assetId: assetKinds.assetId, kind: assetKinds.kind })
    .from(assetKinds)
    .where(inArray(assetKinds.assetId, [...new Set(assetIds)]));
  const held = new Map<AssetId, AssetKind[]>();
  for (const row of rows) {
    held.set(row.assetId, [...(held.get(row.assetId) ?? []), row.kind]);
  }
  return new Map([...held].map(([assetId, kinds]) => [assetId, ASSET_KINDS.filter((kind) => kinds.includes(kind))]));
}
