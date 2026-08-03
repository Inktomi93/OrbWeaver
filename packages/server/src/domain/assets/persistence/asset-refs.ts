// The registry of every `@orb/db` column holding a live `AssetId` FK, iterated by both GC paths
// (`collectGarbage`'s whole-CAS sweep + `reapIfOrphan`'s targeted check) to decide "is this blob referenced?".
// A column missing from BOTH lists silently makes its blobs GC-eligible — the schema-introspection test
// (asset-refs.int.test.ts) enumerates every FK-to-`assets.id` column and asserts each is classified here.
//
// NOT every live asset ref is an FK column: `appearance.backgroundAssetId` (PD-131) AND every entry of the
// `appearance.backgroundLibrary` array (BG-D) are pinned inside the `user_settings.config` JSON blob,
// invisible to the FK enumeration. `selectSettingsReferencedAssetIds` is that JSON live-source — mirroring
// `selectInlineReferencedContents` (chat-canon `asset:` refs) — and it is UNIONED into
// `selectAllReferencedAssetIds` so a pinned own-upload background OR an unpicked library upload never gets
// silently reaped ~1h after upload. BG-C adds two more JSON live-sources of the SAME shape
// (`selectCarriedBackgroundReferencedAssetIds`): `characters.background_override` (card-carried) and
// `chats.metadata.background` (host-set per-chat), so a cross-user carried background asset is never reaped.

import type { Db } from "@orb/db";
import { characters, chats, documents, galleryItems, imageryGenerations, messageAssets, personas, plugins, userSettings } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isNotNull, sql } from "drizzle-orm";
import type { AssetRef } from "../contract/maintenance.ts";

/** RETAINING references — a non-null value here keeps its asset (and blob) LIVE; the safe default for an
 *  ambiguous asset-FK column (over-retaining leaks a blob, under-retaining is data loss). */
export const ASSET_REFS: readonly AssetRef[] = [
  { table: characters, column: characters.avatarAssetId },
  { table: personas, column: personas.avatarAssetId },
  { table: galleryItems, column: galleryItems.assetId },

  { table: imageryGenerations, column: imageryGenerations.assetId },
  { table: messageAssets, column: messageAssets.assetId },

  // A document's original uploaded bytes (SET NULL on purge — retaining while the row points at it).
  { table: documents, column: documents.sourceAssetId },
  // An installed plugin's bundle bytes (RESTRICT — must never be reaped under the install).
  { table: plugins, column: plugins.bundleAssetId },
];

/** DERIVED asset-FK columns — regenerable rows that do NOT pin the blob. Held as `<table>.<column>`
 *  snake-case keys, not drizzle refs: `image_embeddings` is a vector table this file may not import. */
export const DERIVED_ASSET_COLUMNS: readonly string[] = ["image_embeddings.asset_id"];

/** The non-FK live-source: `AssetId`s pinned inside a JSON settings blob. Two sources, both under
 *  `appearance`: the single `backgroundAssetId` (PD-131 own-upload background) AND every entry's `assetId`
 *  in the `backgroundLibrary` array (BG-D — a per-user list of dozens; the whole library must be rooted so
 *  an UNPICKED upload isn't reaped). Read via `json_extract` off every `user_settings.config`; the library
 *  array is parsed in JS (a tiny per-user list, no `json_each` table-function needed). Over-inclusion is
 *  SAFE (an extra id in the live set never reaps a blob); under-inclusion is the silent-reap data-loss bug
 *  this closes, so a present, non-empty value joins the set unconditionally. Mirrors
 *  `selectInlineReferencedContents` (the chat-canon `asset:` JSON live-source). */
async function selectSettingsReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local accumulator for GC live-set
  const live = new Set<AssetId>();
  const rows = await db
    .selectDistinct({
      id: sql<string | null>`json_extract(${userSettings.config}, '$.appearance.backgroundAssetId')`,
      library: sql<string | null>`json_extract(${userSettings.config}, '$.appearance.backgroundLibrary')`,
    })
    .from(userSettings);
  for (const row of rows) {
    if (row.id !== null && row.id.length > 0) {
      live.add(castId<AssetId>(row.id));
    }
    for (const assetId of libraryAssetIds(row.library)) {
      live.add(assetId);
    }
  }
  return live;
}

/** Parse the `backgroundLibrary` JSON array (or null) and yield each entry's non-empty `assetId`. A
 *  malformed blob or a non-array simply yields nothing (over/under-inclusion posture: a dropped id here
 *  only risks a reap, which is why the SHAPE stays lenient rather than throwing on a bad blob). */
function libraryAssetIds(libraryJson: string | null): AssetId[] {
  if (libraryJson === null || libraryJson.length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(libraryJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const ids: AssetId[] = [];
  for (const entry of parsed) {
    const assetId = (entry as { assetId?: unknown } | null)?.assetId;
    if (typeof assetId === "string" && assetId.length > 0) {
      ids.push(castId<AssetId>(assetId));
    }
  }
  return ids;
}

/** The non-FK live-source for the BG-C carried backgrounds — `AssetId`s pinned inside a JSON column as a
 *  background source's `assetId` (`kind:"asset"`). Two locations, both invisible to the FK enumeration:
 *  `characters.background_override` (the per-character card background) and `chats.metadata.background`
 *  (the host-set per-chat background). Read via `json_extract`; the same over/under-inclusion posture as
 *  `selectSettingsReferencedAssetIds` (over-inclusion is SAFE — never reaps; under-inclusion is the silent
 *  cross-user reap this closes: a host's chat background must not vanish because the asset's owner ran GC).
 *  Mirrors the settings live-source exactly. */
async function selectCarriedBackgroundReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local accumulator for GC live-set
  const live = new Set<AssetId>();
  // Root the `assetId` ONLY when the source `kind` is "asset". A non-asset source (`none`/`seeded`/`external`)
  // carries NO asset ref, so a stray/smuggled `assetId` on such a source — a hand-crafted or pre-canonicalization
  // blob — must not pin a foreign asset. This kind guard is the defense-in-depth twin of the write-path
  // canonicalization (`canonicalBackgroundSource`): even an already-persisted smuggled row can't GC-root.
  const cardRows = await db
    .selectDistinct({
      id: sql<string | null>`json_extract(${characters.backgroundOverride}, '$.assetId')`,
      kind: sql<string | null>`json_extract(${characters.backgroundOverride}, '$.kind')`,
    })
    .from(characters)
    .where(isNotNull(characters.backgroundOverride));
  const chatRows = await db
    .selectDistinct({
      id: sql<string | null>`json_extract(${chats.metadata}, '$.background.assetId')`,
      kind: sql<string | null>`json_extract(${chats.metadata}, '$.background.kind')`,
    })
    .from(chats);
  for (const row of [...cardRows, ...chatRows]) {
    if (row.kind === "asset" && row.id !== null && row.id.length > 0) {
      live.add(castId<AssetId>(row.id));
    }
  }
  return live;
}

/** The whole-corpus live set `collectGarbage` sweeps every blob against — the FK registry UNIONED with the
 *  JSON live-sources (settings backgrounds + the BG-C carried card/chat backgrounds), so a JSON-pinned
 *  background is as GC-safe as an FK-referenced avatar. */
export async function selectAllReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local accumulator for GC live-set
  const live = new Set<AssetId>();
  for (const ref of ASSET_REFS) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential DISTINCT reads over the fixed tiny registry — a maintenance-time sweep, not a hot path.
    const rows = await db.selectDistinct({ id: ref.column }).from(ref.table).where(isNotNull(ref.column));
    for (const row of rows) {
      const id = row.id as AssetId | null;
      if (id !== null) {
        live.add(id);
      }
    }
  }
  for (const id of await selectSettingsReferencedAssetIds(db)) {
    live.add(id);
  }
  for (const id of await selectCarriedBackgroundReferencedAssetIds(db)) {
    live.add(id);
  }
  return live;
}

/** The subset of `candidateIds` still referenced — the targeted check `reapIfOrphan` runs on ids
 *  `character.remove` just orphaned. Absent from the result ⇒ safe to reap. Intersects against the WHOLE live
 *  set (`selectAllReferencedAssetIds` — the FK registry UNIONED with the JSON live-sources), NOT just the FK
 *  columns: the no-grace `reapIfOrphan` MUST honor the settings/carried-background JSON pins too, else an asset
 *  referenced ONLY by a settings or carried background (no FK column) is silently reaped the moment its FK ref
 *  dies — e.g. a character whose avatar (FK) doubles as a card/chat background (JSON) via CAS dedup. The
 *  registry is tiny and this is maintenance-time, so the full-set scan is the right cost trade for correctness. */
export async function selectReferencedAmong(db: Db, candidateIds: readonly AssetId[]): Promise<Set<AssetId>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local accumulator for GC candidate check
  const referenced = new Set<AssetId>();
  if (candidateIds.length === 0) {
    return referenced;
  }
  const all = await selectAllReferencedAssetIds(db);
  for (const id of candidateIds) {
    if (all.has(id)) {
      referenced.add(id);
    }
  }
  return referenced;
}
