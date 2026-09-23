// The registry of every `@orb/db` column holding a live `AssetId` FK, plus the ONE reference collector
// (`selectReferencedAssetIds`) every reader derives from: both GC paths (`collectGarbage`'s whole-CAS sweep +
// `reapIfOrphan`'s targeted check) ask "is this blob referenced?", and the portability EXPORT asks the same
// question narrowed to one owner. One home on purpose — while the export walked its own FK-only collector it
// omitted every JSON-pinned background GC keeps alive, so a restore rebuilt the referencing JSON with no bytes.
// A column missing from BOTH lists silently makes its blobs GC-eligible — the schema-introspection test
// (asset-refs.int.test.ts) enumerates every FK-to-`assets.id` column and asserts each is classified here.
//
// NOT every live asset ref is an FK column: `appearance.backgroundAssetId` AND every entry of the
// `appearance.backgroundLibrary` array (BG-D) are pinned inside the `user_settings.config` JSON blob,
// invisible to the FK enumeration. `selectSettingsReferencedAssetIds` is that JSON live-source — mirroring
// `selectInlineReferencedContents` (chat-canon `asset:` refs) — and it is UNIONED into
// `selectAllReferencedAssetIds` so a pinned own-upload background OR an unpicked library upload never gets
// silently reaped ~1h after upload. BG-C adds two more JSON live-sources of the SAME shape
// (`selectCarriedBackgroundReferencedAssetIds`): `characters.background_override` (card-carried) and
// `chats.metadata.background` (host-set per-chat), so a cross-user carried background asset is never reaped.

import type { Db } from "@orb/db";
import {
  adminDistributedPlugins,
  assets,
  characters,
  chats,
  documents,
  galleryItems,
  imageryGenerations,
  messageAssets,
  messageReactions,
  personas,
  pluginAssets,
  plugins,
  userSettings,
} from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, exists, inArray, isNotNull, not, or, sql } from "drizzle-orm";
import type { AssetRef } from "../contract/maintenance.ts";

/** RETAINING references — a non-null value here keeps its asset (and blob) LIVE; the safe default for an
 *  ambiguous asset-FK column (over-retaining leaks a blob, under-retaining is data loss).
 *
 *  @public The registry IS the cross-tool contract: `asset-refs-fk-coverage` reads this array STRUCTURALLY
 *  by name (ts-morph, no import edge), and the int test derives every `assets.id` FK from the real schema
 *  against it. Both readers sit outside this module's import graph, which is why the export has none. */
export const ASSET_REFS: readonly AssetRef[] = [
  { table: characters, column: characters.avatarAssetId },
  { table: personas, column: personas.avatarAssetId },
  { table: galleryItems, column: galleryItems.assetId },

  { table: imageryGenerations, column: imageryGenerations.assetId },
  { table: messageAssets, column: messageAssets.assetId },
  // B6/MR0 — a CUSTOM reaction emoji's image. The column is born-and-typed and nothing writes it through
  // MR0-MR2 (the wire is unicode-only), so this row retains nothing TODAY; it is here because a
  // CAS-referencing column the registry cannot see is exactly how a live reference gets reaped, and the
  // schema-introspection test enumerates every FK-to-`assets.id` column and REDs an unclassified one — so
  // the alternative is not "add it later", it is a red gate now and a purged blob later.
  { table: messageReactions, column: messageReactions.emojiImageAssetId },

  // A document's original uploaded bytes (SET NULL on purge — retaining while the row points at it).
  { table: documents, column: documents.sourceAssetId },
  // An installed plugin's bundle bytes (RESTRICT — must never be reaped under the install).
  { table: plugins, column: plugins.bundleAssetId },
  // A SERVER-WIDE PUBLISHED plugin bundle (D147 clause (d)) — the bytes every future new-user application
  // re-reads. RETAINING for exactly that reason: the publishing admin may have no `plugins` row of their own
  // at that slug (they can uninstall their copy), and without this the blob would be reaped out from under
  // the distribution set while the record still pointed at it. Its own FK is CASCADE (a distribution cannot
  // outlive its bytes), which is the delete direction — this list is about the GC direction.
  { table: adminDistributedPlugins, column: adminDistributedPlugins.bundleAssetId },
  // #802 — an image an installed plugin pulled into its installer's CAS with `net.fetchAsset`. It has no other
  // referencing row ANYWHERE: the surface that displays it (a plugin UI state blob) is JSON, so the FK
  // enumeration could not see it and the scheduled GC reaped a live hub cover one grace window after the fetch.
  // The retention unit is the INSTALL — uninstall CASCADEs these links away and the covers become ordinary
  // candidates again (the uninstall verb reaps them eagerly). Same posture as `message_assets`: the link row
  // exists so this registry can SEE the reference.
  { table: pluginAssets, column: pluginAssets.assetId },
];

/** DERIVED asset-FK columns — regenerable rows that do NOT pin the blob. Held as `<table>.<column>`
 *  snake-case keys, not drizzle refs: `image_embeddings` / `image_index_skips` are embeddings-owned tables
 *  this file may not import. `image_index_skips` is the indexer's admission-floor skip-log (#273): a
 *  re-derivable verdict about the bytes, so it must NOT keep a degenerate blob alive (it CASCADEs away when
 *  the asset is reaped — retaining it would make a skipped 1×1 un-GC-able forever).
 *
 *  The `@public` marker retired 2026-09-05: the front door now re-exports this list and the
 *  `structure:asset-refs` stage's comparator consumes it, so it is an ordinary consumed export and a
 *  `@public`-family marker on a consumed export is stale by the orphan-ratchet's own two-sided rule. */
export const DERIVED_ASSET_COLUMNS: readonly string[] = ["image_embeddings.asset_id", "image_index_skips.asset_id"];

/** The non-FK live-source: `AssetId`s pinned inside a JSON settings blob. Two sources, both under
 *  `appearance`: the single `backgroundAssetId` (own-upload background) AND every entry's `assetId`
 *  in the `backgroundLibrary` array (BG-D — a per-user list of dozens; the whole library must be rooted so
 *  an UNPICKED upload isn't reaped). Read via `json_extract` off every `user_settings.config`; the library
 *  array is parsed in JS (a tiny per-user list, no `json_each` table-function needed). Over-inclusion is
 *  SAFE (an extra id in the live set never reaps a blob); under-inclusion is the silent-reap data-loss bug
 *  this closes, so a present, non-empty value joins the set unconditionally. Mirrors
 *  `selectInlineReferencedContents` (the chat-canon `asset:` JSON live-source). */
async function selectSettingsReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  // @orb-waive persistence-no-in-memory-state(Set): query-local accumulator for GC live-set. Ends if it outlives the call.
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

/** Parse the `backgroundLibrary` JSON array (or null) and yield each entry's non-empty `assetId`. Genuinely
 *  ABSENT (`null`/empty string) yields nothing — that is the documented no-library state, safe to treat as
 *  empty. A PRESENT-but-unreadable value (invalid JSON, or valid JSON that isn't an array) throws instead of
 *  silently yielding `[]`: this function's whole reason to exist is closing an under-inclusion reap (see the
 *  module header), and `[]` on a present-but-corrupt value would re-open exactly that hole — a corrupt
 *  settings row would silently DROP its library's ids from the live set, and `collectGarbage` would then
 *  reap a still-referenced asset + blob out from under it (#757). Corrupt settings are deliberately
 *  preserved for repair rather than normalized (never silently discarded here) — this function fails the
 *  READ, not the settings row. */
function libraryAssetIds(libraryJson: string | null): AssetId[] {
  if (libraryJson === null || libraryJson.length === 0) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(libraryJson);
  } catch (cause) {
    const error = new DomainOperationError(
      "asset_refs_unmeasurable",
      "appearance.backgroundLibrary is present but not valid JSON — refusing to treat it as empty",
    );
    error.cause = cause;
    throw error;
  }
  if (!Array.isArray(parsed)) {
    throw new DomainOperationError("asset_refs_unmeasurable", "appearance.backgroundLibrary is present but not an array — refusing to treat it as empty");
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
  // @orb-waive persistence-no-in-memory-state(Set): query-local accumulator for GC live-set. Ends if it outlives the call.
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

/** The FK half of the live set. `ownerId === null` is the whole-corpus GC sweep; an owner narrows every
 *  registry column to THAT owner's assets through the `assets` join (the export half — a bundle carries only
 *  its owner's blobs, and a foreign-owned referenced asset is not the exporter's to ship). */
async function selectFkReferencedAssetIds(db: Db, ownerId: UserId | null): Promise<Set<AssetId>> {
  // @orb-waive persistence-no-in-memory-state(Set): query-local accumulator for the reference live-set. Ends if it outlives the call.
  const live = new Set<AssetId>();
  for (const ref of ASSET_REFS) {
    // @orb-waive no-await-db-in-loop(where): one SELECT per ASSET_REFS registry row, not per data row — each ref names a DIFFERENT table and column, so the twelve reads cannot collapse into one statement. Ends when the registry is expressible as one UNION over a generated view.
    const rows =
      ownerId === null
        ? await db.selectDistinct({ id: ref.column }).from(ref.table).where(isNotNull(ref.column))
        : await db
            .selectDistinct({ id: ref.column })
            .from(ref.table)
            .innerJoin(assets, eq(assets.id, ref.column))
            .where(and(isNotNull(ref.column), eq(assets.ownerId, ownerId)));
    for (const row of rows) {
      const id = row.id as AssetId | null;
      if (id !== null) {
        live.add(id);
      }
    }
  }
  return live;
}

/** SQLite's bound-parameter ceiling is per statement, and the JSON live-sources are cross-user by design
 *  (any user's settings/card/chat may pin any asset), so the owner narrowing runs in bounded batches rather
 *  than one unbounded `IN (…)`. */
const OWNER_FILTER_BATCH = 500;

/** The ids among `candidates` whose `assets` row belongs to `ownerId`. The JSON live-sources cannot express
 *  the owner filter in their own SQL (they read a foreign table's JSON column, and the library array is
 *  parsed in JS precisely so a corrupt value FAILS instead of silently reading empty — see
 *  `libraryAssetIds`), so the narrowing happens here, against the index rows themselves. */
async function narrowToOwner(db: Db, candidates: ReadonlySet<AssetId>, ownerId: UserId): Promise<Set<AssetId>> {
  // @orb-waive persistence-no-in-memory-state(Set): query-local accumulator for the reference live-set. Ends if it outlives the call.
  const owned = new Set<AssetId>();
  const ids = [...candidates];
  for (let i = 0; i < ids.length; i += OWNER_FILTER_BATCH) {
    // @orb-waive no-await-db-in-loop(where): deliberate chunking: the loop steps by OWNER_FILTER_BATCH because the id set exceeds the libSQL bound-variable cap, so one round trip per chunk IS the batching. Ends if the driver lifts the cap.
    const rows = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.ownerId, ownerId), inArray(assets.id, ids.slice(i, i + OWNER_FILTER_BATCH))));
    for (const row of rows) {
      owned.add(row.id);
    }
  }
  return owned;
}

/** The ONE reference collector — the FK registry UNIONED with every JSON live-source (settings pick +
 *  library, the BG-C carried card/chat backgrounds), optionally narrowed to one owner. Both readers derive
 *  from it: GC sweeps blobs against the whole-corpus set (`ownerId === null`), and the portability export
 *  ships the owner-scoped set. They MUST NOT diverge — a reference GC honors but the export misses restores
 *  the referencing JSON without its bytes, which is the same data loss with a longer fuse. */
async function selectReferencedAssetIds(db: Db, ownerId: UserId | null): Promise<Set<AssetId>> {
  const live = await selectFkReferencedAssetIds(db, ownerId);
  // @orb-waive persistence-no-in-memory-state(Set): query-local accumulator for the reference live-set. Ends if it outlives the call.
  const jsonPinned = new Set<AssetId>();
  for (const id of await selectSettingsReferencedAssetIds(db)) {
    jsonPinned.add(id);
  }
  for (const id of await selectCarriedBackgroundReferencedAssetIds(db)) {
    jsonPinned.add(id);
  }
  for (const id of ownerId === null ? jsonPinned : await narrowToOwner(db, jsonPinned, ownerId)) {
    live.add(id);
  }
  return live;
}

/** The whole-corpus live set `collectGarbage` sweeps every blob against. */
export async function selectAllReferencedAssetIds(db: Db): Promise<Set<AssetId>> {
  return await selectReferencedAssetIds(db, null);
}

/** The live set restricted to ONE owner's assets — the portability export's reference walk. */
export async function selectOwnedReferencedAssetIds(db: Db, ownerId: UserId): Promise<Set<AssetId>> {
  return await selectReferencedAssetIds(db, ownerId);
}

/** The subset of `candidateIds` still referenced — the targeted check `reapIfOrphan` runs on ids
 *  `character.remove` just orphaned. Absent from the result ⇒ safe to reap. Intersects against the WHOLE live
 *  set (`selectAllReferencedAssetIds` — the FK registry UNIONED with the JSON live-sources), NOT just the FK
 *  columns: the no-grace `reapIfOrphan` MUST honor the settings/carried-background JSON pins too, else an asset
 *  referenced ONLY by a settings or carried background (no FK column) is silently reaped the moment its FK ref
 *  dies — e.g. a character whose avatar (FK) doubles as a card/chat background (JSON) via CAS dedup. The
 *  registry is tiny and this is maintenance-time, so the full-set scan is the right cost trade for correctness. */
export async function selectReferencedAmong(db: Db, candidateIds: readonly AssetId[]): Promise<Set<AssetId>> {
  // @orb-waive persistence-no-in-memory-state(Set): query-local accumulator for GC candidate check. Ends if it outlives the call.
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

/** Delete one asset row only while every retaining relation is absent. The liveness predicate lives in the
 * same SQL statement as the destructive write, so a concurrent writer cannot land a reference between an
 * application-side preflight and the delete. The returned verdict owns whether callers may remove CAS bytes. */
export async function deleteAssetRowIfUnreferenced(db: Db, ownerId: UserId, assetId: AssetId): Promise<boolean> {
  const fkReferences = ASSET_REFS.map((ref) => exists(db.select({ one: sql`1` }).from(ref.table).where(eq(ref.column, assetId))));
  const settingsReference = exists(
    db
      .select({ one: sql`1` })
      .from(userSettings)
      .where(
        or(
          eq(sql<string | null>`json_extract(${userSettings.config}, '$.appearance.backgroundAssetId')`, assetId),
          sql`EXISTS (
            SELECT 1
            FROM json_tree(${userSettings.config}, '$.appearance.backgroundLibrary') AS library
            WHERE library.key = 'assetId' AND library.atom = ${assetId}
          )`,
        ),
      ),
  );
  const cardReference = exists(
    db
      .select({ one: sql`1` })
      .from(characters)
      .where(
        and(
          eq(sql<string | null>`json_extract(${characters.backgroundOverride}, '$.kind')`, "asset"),
          eq(sql<string | null>`json_extract(${characters.backgroundOverride}, '$.assetId')`, assetId),
        ),
      ),
  );
  const chatReference = exists(
    db
      .select({ one: sql`1` })
      .from(chats)
      .where(
        and(
          eq(sql<string | null>`json_extract(${chats.metadata}, '$.background.kind')`, "asset"),
          eq(sql<string | null>`json_extract(${chats.metadata}, '$.background.assetId')`, assetId),
        ),
      ),
  );
  const anyReference = or(...fkReferences, settingsReference, cardReference, chatReference) ?? sql`0`;
  const deleted = await db
    .delete(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId), not(anyReference)))
    .returning({ id: assets.id });
  return deleted.length === 1;
}
