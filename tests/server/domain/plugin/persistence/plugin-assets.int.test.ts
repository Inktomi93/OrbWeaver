// persistence: plugin-assets — the `net.fetchAsset` register (#802). These rows are the ONLY thing keeping a
// plugin-fetched cover out of the asset GC, so what matters here is (1) the record is idempotent under the
// re-fetch a content-addressed CAS produces (same bytes ⇒ same assetId ⇒ one row, refreshed stamp — never a
// duplicate-key throw that would reject the guest's fetch), and (2) the read is per-plugin, because `uninstall`
// hands exactly its own result to the reaper and a leaked foreign id would reap a live asset.

import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, pluginAssets } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { listPluginFetchedAssetIds, recordPluginFetchedAsset } from "../../../../../packages/server/src/domain/plugin/persistence/plugin-assets.ts";
import { insertPlugin } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1000;

async function seedAsset(db: Db, ownerId: UserId, id: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "generated", mime: "image/png", size: 10, hash: `hash-${id}`, uploadedAt: AT });
  return assetId;
}

async function seedPlugin(db: Db, ownerId: UserId, id: string, slug: string): Promise<PluginId> {
  const pluginId = castId<PluginId>(id);
  const bundleAssetId = castId<AssetId>(`asset_bundle_${id}`);
  await db.insert(assets).values({ id: bundleAssetId, ownerId, kind: "plugin", mime: "application/zip", size: 10, hash: `hash-${id}`, uploadedAt: AT });
  await insertPlugin(db, {
    id: pluginId,
    ownerId,
    slug,
    name: slug,
    version: "1.0.0",
    manifest: pluginManifestSchema.parse({ id: slug, name: slug, version: "1.0.0", hostVersion: 1, entry: "main.js", description: "x", capabilities: [] }),
    bundleAssetId,
    grantedCapabilities: [],
    status: "disabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    installedAt: AT,
    updatedAt: AT,
  });
  return pluginId;
}

test("recordPluginFetchedAsset is idempotent under a re-fetch — one row, refreshed stamp", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = await seedPlugin(db, owner, "plugin_rec", "atlas");
  const cover = await seedAsset(db, owner, "asset_cover_rec");

  await recordPluginFetchedAsset(db, pluginId, cover, AT);
  // The SAME bytes fetched an hour later: the CAS dedups to the same assetId, so this is the live shape — a
  // second INSERT (not an update) would throw on the PK and reject the guest's `net.fetchAsset`.
  await recordPluginFetchedAsset(db, pluginId, cover, AT + 3_600_000);

  const rows = await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.fetchedAt).toBe(AT + 3_600_000);
});

test("listPluginFetchedAssetIds returns THIS plugin's fetches only (the uninstall reaper's candidate set)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const mine = await seedPlugin(db, owner, "plugin_mine", "atlas");
  const theirs = await seedPlugin(db, owner, "plugin_theirs", "gallery");
  const a = await seedAsset(db, owner, "asset_cover_a");
  const b = await seedAsset(db, owner, "asset_cover_b");
  const foreign = await seedAsset(db, owner, "asset_cover_foreign");
  await recordPluginFetchedAsset(db, mine, a, AT);
  await recordPluginFetchedAsset(db, mine, b, AT);
  await recordPluginFetchedAsset(db, theirs, foreign, AT);

  const ids = await listPluginFetchedAssetIds(db, mine);

  expect([...ids].sort()).toEqual([a, b].sort());
  // The other plugin's cover is NOT in the set — uninstalling one plugin must never hand another's asset to
  // the reaper.
  expect(ids).not.toContain(foreign);
  // A plugin that fetched nothing reads empty (not "everything").
  const none = await seedPlugin(db, owner, "plugin_none", "quiet");
  expect(await listPluginFetchedAssetIds(db, none)).toEqual([]);
});
