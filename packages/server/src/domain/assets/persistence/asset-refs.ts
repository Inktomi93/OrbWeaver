// domain/assets/persistence/asset-refs — THE asset-reference REGISTRY: the ONE typed list of every column in
// `@orb/db` that holds a live `AssetId` pointer, which BOTH garbage-collection paths (`collectGarbage`'s
// whole-CAS sweep + `reapIfOrphan`'s targeted check) iterate to build the "is this blob still referenced?"
// answer. Same placement pattern as tag's `persistence/junctions.ts` registry: one home, no scattered
// per-column knowledge.
//
// WHY THIS FILE IS LOAD-BEARING (silent data loss): GC deletes blobs. A blob whose asset id appears in NO
// registry column (and is past the grace window) is reclaimed. Adding a new asset-bearing column
// (NPC art, sprites, attachments) WITHOUT registering it here makes every blob referenced ONLY by that column
// silently GC-eligible — a card that looks unreferenced gets swept. The schema-introspection test
// (`tests/server/domain/assets/persistence/asset-refs.int.test.ts`) closes this STRUCTURALLY: it enumerates
// every FK-to-`assets.id` column in the live schema and asserts each is classified here (RETAINING or
// DERIVED) — a new column that is neither fails the test, so the miss cannot ship silently.
//
// TWO CLASSES (the partition the introspection test proves is TOTAL):
//   • RETAINING (`ASSET_REFS`) — an UPSTREAM pointer whose existence must keep the blob alive: a character/
//     persona/NPC avatar, a curated gallery item, a character sprite, a document's source file, an imagery
//     generation's output. Losing the blob under any of these is user-visible data loss, so GC/reap treat
//     the referenced asset as LIVE. The SAFE default: an ambiguous asset-FK column belongs HERE (over-
//     retaining only leaks a benign slow-healing blob; under-retaining is catastrophic — PD-26 §rationale).
//   • DERIVED (`DERIVED_ASSET_COLUMNS`) — a DOWNSTREAM row that is REGENERABLE and cascade-deleted WITH its
//     asset (it does NOT pin the blob). Today only `image_embeddings.assetId`: the vector lens of an asset,
//     re-derivable by the embeddings indexer's `content_hash` catch-up sweep (PD-53). It is EXCLUDED from the
//     live set ON PURPOSE — every image asset has an embedding, so counting it as retaining would make
//     `reapIfOrphan` (avatar cleanup on `character.remove`) and `collectGarbage` reclaim NOTHING.
//
// CHAT-CANON `asset:<id>` COVERAGE (#67): a message body stores its inline images as `asset:<id>` TEXT refs
// (D51), which this registry — a list of FK COLUMNS — cannot see. The two producers each carry a STRUCTURAL
// retaining FK so the blob is visible here: a generated chat image carries an `imagery_generations` row, and
// a user-uploaded ATTACHMENT carries a `message_assets` row (`messageAssets.assetId`, registered below). Both
// are RETAINING, so GC never reclaims a blob still shown in a live chat. The generic "any arbitrary asset id
// typed into any body" canon-scan (a text ref with NO structural row — e.g. a hand-pasted foreign id) remains
// a PD follow-up; both first-class inline-image paths (generate + attach) are now structurally covered.

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

/** RETAINING references — a non-null value here keeps its asset (and blob) LIVE. Every FK-to-`assets.id`
 *  column that represents a user-meaningful pointer. The introspection test asserts this set ∪
 *  {@link DERIVED_ASSET_COLUMNS} covers EVERY asset-FK column in the schema. */
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

/** DERIVED asset-FK columns — regenerable downstream rows that do NOT pin the blob (they cascade-delete WITH
 *  their asset). Listed EXPLICITLY (not merely omitted) so the introspection test can prove the partition is
 *  total: a new asset-FK column must be consciously placed in ONE of the two lists, never forgotten. Held as
 *  `<table>.<column>` snake-case KEYS (not drizzle refs): these columns are NEVER queried by GC — only the
 *  introspection test reads them — and `image_embeddings` is a VECTOR table the `vector-table-access` gate
 *  bars this file from importing (Knowledge-Cluster inv 1). The key spelling matches the schema FK names. */
export const DERIVED_ASSET_COLUMNS: readonly string[] = ["image_embeddings.asset_id"];

/** Gather the set of asset ids referenced by AT LEAST ONE {@link ASSET_REFS} column — the whole-corpus live
 *  set `collectGarbage` sweeps every blob against. One `SELECT DISTINCT` per registered column (a handful of
 *  small maintenance-time reads); unioned into a `Set` for O(1) membership. */
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

/** The subset of `candidateIds` still referenced by AT LEAST ONE {@link ASSET_REFS} column — the targeted
 *  check `reapIfOrphan` runs over the known id set `character.remove` just orphaned. A candidate absent from
 *  the returned set is referenced by NOTHING and is safe to reap. Empty input ⇒ empty set (no query). */
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
