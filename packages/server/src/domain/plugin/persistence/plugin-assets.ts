// domain/plugin/persistence/plugin-assets — the `plugin_assets` register: which assets an installed plugin
// holds. TWO provenances share the table (see its schema header): a cover pulled at RUNTIME through
// `net.fetchAsset` (#802, `bundlePath: ""`), and an image unpacked at INSTALL time from the bundle's
// `ui/assets/` directory (#820, `bundlePath: "ui/assets/<name>"`). Both exist to be SEEN by the asset-GC ref
// registry (`domain/assets/persistence/asset-refs.ts#ASSET_REFS`); the bundle rows are additionally the
// path → assetId RESOLUTION source a UI `image`/hero/tile node is rendered through.
// Queries only. The fetched write is called from the `storeFetched` host op after the CAS store has minted the
// id; the bundle rows are BATCHED with their `plugins` row by install/upgrade (one atomic write — a row whose
// links half-landed would render placeholders forever); the reads are called by `uninstall` BEFORE it deletes
// the row (the FK CASCADE takes these with it, so an after-the-fact read returns nothing to reap) and by
// `listBundleAssets` on the render path.

import type { Db } from "@orb/db";
import { pluginAssets } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { AssetId, PluginId } from "@orb/kit/ids";
import { and, eq, ne } from "drizzle-orm";
import type { PluginBundleAssetLink } from "../contract/bundle-assets.ts";
import type { PluginBundleAssetView } from "../contract/results.ts";

/** The `bundle_path` value for a RUNTIME-fetched cover — the schema's "not a bundle asset" sentinel, spelled
 *  once here so the writers and the readers cannot disagree about it (SQLite cannot use NULL: it does not
 *  enforce NOT NULL on a rowid table's PK columns, so NULLs would compare distinct and defeat the upsert). */
const FETCHED_NO_PATH = "";

/** Record that `pluginId` fetched `assetId` — the RETAINING reference that keeps the blob out of GC while the
 *  plugin is installed. Idempotent: the CAS is content-addressed, so a re-fetch of the same bytes returns the
 *  SAME assetId and this upserts the existing row's `fetchedAt` rather than duplicating it (the PK is the
 *  triple, and this writer always uses the empty-path sentinel, so a runtime fetch can never collide with —
 *  or overwrite — a bundle-shipped row for the same bytes). No owner filter: no coordinate is guest-supplied
 *  — see the table's header for why the `plugin_kv` guard column has no counterpart here. */
export async function recordPluginFetchedAsset(db: Db, pluginId: PluginId, assetId: AssetId, fetchedAt: number): Promise<void> {
  await db
    .insert(pluginAssets)
    .values({ pluginId, assetId, bundlePath: FETCHED_NO_PATH, fetchedAt })
    .onConflictDoUpdate({ target: [pluginAssets.pluginId, pluginAssets.assetId, pluginAssets.bundlePath], set: { fetchedAt } });
}

/** The statement that links ONE bundle-shipped asset (#820) to its plugin at `bundlePath`. Returned
 *  UNEXECUTED so install/upgrade can batch every link with the `plugins` row write itself — the links and the
 *  row land together or not at all, because a row whose links half-landed renders permanent placeholders and
 *  leaves the missing blobs to the GC. Upserts on the triple: re-installing the same bundle over the same
 *  plugin (an upgrade to an identical asset set) refreshes `fetchedAt` instead of colliding. */
export function linkPluginBundleAssetStatement(db: Db, pluginId: PluginId, link: PluginBundleAssetLink): BatchStmt {
  return db
    .insert(pluginAssets)
    .values({ pluginId, assetId: link.assetId, bundlePath: link.bundlePath, fetchedAt: link.at })
    .onConflictDoUpdate({ target: [pluginAssets.pluginId, pluginAssets.assetId, pluginAssets.bundlePath], set: { fetchedAt: link.at } });
}

/** The statement that drops EVERY bundle-shipped link of `pluginId` (`bundle_path <> ''`), leaving the
 *  runtime-fetched covers alone. An upgrade batches this AHEAD of the new links so the row's bundle-asset set
 *  is exactly the NEW bundle's: a delete-then-insert states the set rather than merging into it, which is
 *  what makes a dropped sprite actually disappear instead of lingering as a resolvable path. */
export function clearPluginBundleAssetsStatement(db: Db, pluginId: PluginId): BatchStmt {
  return db.delete(pluginAssets).where(and(eq(pluginAssets.pluginId, pluginId), ne(pluginAssets.bundlePath, FETCHED_NO_PATH)));
}

/** Every asset this plugin holds — fetched AND bundle-shipped — as the candidate set `uninstall` hands to
 *  `reapIfOrphan` once the row (and with it these links) is gone. `reapIfOrphan` re-checks the WHOLE registry
 *  per id, so an asset that a second plugin also holds, or that the user meanwhile made their avatar, is never
 *  reaped by this. DISTINCT ids: a bundle shipping one image at two paths has two rows and one blob. */
export async function listPluginFetchedAssetIds(db: Db, pluginId: PluginId): Promise<AssetId[]> {
  const rows = await db.selectDistinct({ assetId: pluginAssets.assetId }).from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId));
  return rows.map((row) => row.assetId);
}

/** The BUNDLE-shipped links only (`bundle_path <> ''`) — the path → assetId map a UI node resolves through,
 *  and the "what did the OLD bundle hold" read an upgrade diffs against to decide what to reap. Ordered by
 *  path so the projection is stable. NOT owner-scoped here: the callers reach it only through an already
 *  owner-scoped `plugins` row load (`getById(db, caller.userId, …)`), which is this domain's whole authority
 *  model (D147) — a `pluginId` arriving here has already been proven to belong to the asker. */
export async function listPluginBundleAssets(db: Db, pluginId: PluginId): Promise<PluginBundleAssetView[]> {
  const rows = await db
    .select({ path: pluginAssets.bundlePath, assetId: pluginAssets.assetId })
    .from(pluginAssets)
    .where(and(eq(pluginAssets.pluginId, pluginId), ne(pluginAssets.bundlePath, FETCHED_NO_PATH)))
    .orderBy(pluginAssets.bundlePath);
  return rows.map((row) => ({ path: row.path, assetId: row.assetId }));
}
