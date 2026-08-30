// domain/plugin/persistence/plugin-assets — the `plugin_assets` register: which assets an installed plugin
// pulled into the installer's CAS through `net.fetchAsset` (#802). The rows exist to be SEEN by the asset-GC
// ref registry (`domain/assets/persistence/asset-refs.ts#ASSET_REFS`) — nothing reads them for display.
// Queries only; the write is called from the `storeFetched` host op after the CAS store has minted the id,
// and the read is called by `uninstall` BEFORE it deletes the row (the FK CASCADE takes these with it, so an
// after-the-fact read returns nothing to reap).

import type { Db } from "@orb/db";
import { pluginAssets } from "@orb/db";
import type { AssetId, PluginId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

/** Record that `pluginId` fetched `assetId` — the RETAINING reference that keeps the blob out of GC while the
 *  plugin is installed. Idempotent: the CAS is content-addressed, so a re-fetch of the same bytes returns the
 *  SAME assetId and this upserts the existing row's `fetchedAt` rather than duplicating it (the PK is the
 *  pair). No owner filter: neither coordinate is guest-supplied — see the table's header for why the
 *  `plugin_kv` guard column has no counterpart here. */
export async function recordPluginFetchedAsset(db: Db, pluginId: PluginId, assetId: AssetId, fetchedAt: number): Promise<void> {
  await db
    .insert(pluginAssets)
    .values({ pluginId, assetId, fetchedAt })
    .onConflictDoUpdate({ target: [pluginAssets.pluginId, pluginAssets.assetId], set: { fetchedAt } });
}

/** Every asset this plugin fetched — the candidate set `uninstall` hands to `reapIfOrphan` once the row (and
 *  with it these links) is gone. `reapIfOrphan` re-checks the WHOLE registry per id, so an asset that a second
 *  plugin also fetched, or that the user meanwhile made their avatar, is never reaped by this. */
export async function listPluginFetchedAssetIds(db: Db, pluginId: PluginId): Promise<AssetId[]> {
  const rows = await db.select({ assetId: pluginAssets.assetId }).from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId));
  return rows.map((row) => row.assetId);
}
