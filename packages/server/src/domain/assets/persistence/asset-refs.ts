// The registry of every `@orb/db` column holding a live `AssetId` FK, iterated by both GC paths
// (`collectGarbage`'s whole-CAS sweep + `reapIfOrphan`'s targeted check) to decide "is this blob referenced?".
// A column missing from BOTH lists silently makes its blobs GC-eligible — the schema-introspection test
// (asset-refs.int.test.ts) enumerates every FK-to-`assets.id` column and asserts each is classified here.

import type { Db } from "@orb/db";
import {
  characterSprites,
  characters,
  documents,
  galleryItems,
  imageryGenerations,
  messageAssets,
  personas,
  rpgNpcs,
} from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { inArray, isNotNull } from "drizzle-orm";
import type { AssetRef } from "../contract/maintenance";

/** RETAINING references — a non-null value here keeps its asset (and blob) LIVE; the safe default for an
 *  ambiguous asset-FK column (over-retaining leaks a blob, under-retaining is data loss). */
export const ASSET_REFS: readonly AssetRef[] = [
  { table: characters, column: characters.avatarAssetId },
  { table: personas, column: personas.avatarAssetId },
  { table: galleryItems, column: galleryItems.assetId },
  { table: characterSprites, column: characterSprites.assetId },
  { table: documents, column: documents.sourceAssetId },
  { table: rpgNpcs, column: rpgNpcs.avatarAssetId },
  { table: imageryGenerations, column: imageryGenerations.assetId },
  { table: messageAssets, column: messageAssets.assetId },
];

/** DERIVED asset-FK columns — regenerable rows that do NOT pin the blob. Held as `<table>.<column>`
 *  snake-case keys, not drizzle refs: `image_embeddings` is a vector table this file may not import. */
export const DERIVED_ASSET_COLUMNS: readonly string[] = ["image_embeddings.asset_id"];

/** The whole-corpus live set `collectGarbage` sweeps every blob against. */
export async function selectAllReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  const live = new Set<AssetId>();
  for (const ref of ASSET_REFS) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential DISTINCT reads over the fixed tiny registry — a maintenance-time sweep, not a hot path.
    const rows = await db
      .selectDistinct({ id: ref.column })
      .from(ref.table)
      .where(isNotNull(ref.column));
    for (const row of rows) {
      const id = row.id as AssetId | null;
      if (id !== null) {
        live.add(id);
      }
    }
  }
  return live;
}

/** The subset of `candidateIds` still referenced — the targeted check `reapIfOrphan` runs on ids
 *  `character.remove` just orphaned. Absent from the result ⇒ safe to reap. */
export async function selectReferencedAmong(
  db: Db,
  candidateIds: readonly AssetId[],
): Promise<Set<AssetId>> {
  const referenced = new Set<AssetId>();
  if (candidateIds.length === 0) {
    return referenced;
  }
  for (const ref of ASSET_REFS) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential reads over the fixed registry (a small known id set) — maintenance-time, not a hot path.
    const rows = await db
      .selectDistinct({ id: ref.column })
      .from(ref.table)
      .where(inArray(ref.column, candidateIds as AssetId[]));
    for (const row of rows) {
      const id = row.id as AssetId | null;
      if (id !== null) {
        referenced.add(id);
      }
    }
  }
  return referenced;
}
