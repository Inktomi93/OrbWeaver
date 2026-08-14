// plugin.int — schema/plugin (plugins + plugin_kv) against a real libSQL :memory: db (FK PRAGMA ON).
// Covers: plugins round-trip (manifest/grantedCapabilities json); unique(ownerId, slug); status CHECK
// (derives PLUGIN_STATUSES); bundleAssetId RESTRICT (a live install blocks the bundle's asset delete);
// owner CASCADE (deleting the owner drops their plugins); plugin_kv composite PK + key/value length
// CHECKs + pluginId CASCADE.

import type { PluginCapability, PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_STATUSES, pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, pluginKv, plugins, users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedUser } from "./_support.ts";

function isConstraintErr(err: unknown): boolean {
  return isConstraintViolation(err) !== undefined;
}

const MANIFEST: PluginManifest = pluginManifestSchema.parse({
  id: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  hostVersion: 1,
  entry: "main.js",
  description: "a plugin.int fixture",
  capabilities: ["storage.kv"],
});
const GRANTS: PluginCapability[] = [...MANIFEST.capabilities];

async function seedAsset(db: Db, ownerId: UserId, id: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "document", mime: "application/zip", size: 10, hash: `hash-${id}` });
  return assetId;
}

test("status enum mirrors PLUGIN_STATUSES (derives the tuple, never re-spells)", () => {
  expect(plugins.status.enumValues).toEqual([...PLUGIN_STATUSES]);
});

test("plugins round-trips, unique(ownerId,slug) collides, status CHECK bites", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_a" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_a");
  const id = castId<PluginId>("plugin_a");
  const now = 1000;

  await db.insert(plugins).values({
    id,
    ownerId,
    slug: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "enabled",
    origin: "upload",
    installedAt: now,
    updatedAt: now,
  });

  const rows = await db.select().from(plugins).where(eq(plugins.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.manifest).toEqual(MANIFEST);
  expect(rows[0]?.grantedCapabilities).toEqual(GRANTS);
  expect(rows[0]?.consecutiveCrashes).toBe(0);

  // Same (ownerId, slug) → collides.
  const bundleAssetId2 = await seedAsset(db, ownerId, "asset_plugin_a2");
  await expect(
    db.insert(plugins).values({
      id: castId<PluginId>("plugin_a2"),
      ownerId,
      slug: "test-plugin",
      name: "Test Plugin 2",
      version: "1.0.0",
      manifest: MANIFEST,
      bundleAssetId: bundleAssetId2,
      grantedCapabilities: GRANTS,
      status: "enabled",
      origin: "upload",
      installedAt: now,
      updatedAt: now,
    }),
  ).rejects.toSatisfy(isConstraintErr);

  // status CHECK rejects a value outside the canonical tuple.
  await expect(
    db.insert(plugins).values({
      id: castId<PluginId>("plugin_bad"),
      ownerId,
      slug: "bad-plugin",
      name: "Bad",
      version: "1.0.0",
      manifest: MANIFEST,
      bundleAssetId: bundleAssetId2,
      grantedCapabilities: GRANTS,
      status: "bogus" as "enabled",
      origin: "upload",
      installedAt: now,
      updatedAt: now,
    }),
  ).rejects.toSatisfy(isConstraintErr);
});

test("bundleAssetId RESTRICT blocks the bundle's asset delete while installed; owner CASCADE drops the plugin", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_b" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_b");
  const id = castId<PluginId>("plugin_b");
  const now = 1000;

  await db.insert(plugins).values({
    id,
    ownerId,
    slug: "restrict-plugin",
    name: "Restrict Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "enabled",
    origin: "upload",
    installedAt: now,
    updatedAt: now,
  });

  // The bundle asset cannot be deleted while an installed plugin FKs it (ON DELETE RESTRICT).
  await expect(db.delete(assets).where(eq(assets.id, bundleAssetId))).rejects.toSatisfy(isConstraintErr);

  // Delete row-then-asset (the documented uninstall order) succeeds.
  await db.delete(plugins).where(eq(plugins.id, id));
  await db.delete(assets).where(eq(assets.id, bundleAssetId));
  expect(await db.select().from(assets).where(eq(assets.id, bundleAssetId))).toHaveLength(0);

  // Owner CASCADE: a second plugin under the same owner is dropped by an owner delete.
  const bundleAssetId2 = await seedAsset(db, ownerId, "asset_plugin_b2");
  await db.insert(plugins).values({
    id: castId<PluginId>("plugin_b2"),
    ownerId,
    slug: "cascade-plugin",
    name: "Cascade Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId: bundleAssetId2,
    grantedCapabilities: GRANTS,
    status: "enabled",
    origin: "upload",
    installedAt: now,
    updatedAt: now,
  });
  await db.delete(users).where(eq(users.id, ownerId));
  expect(
    await db
      .select()
      .from(plugins)
      .where(eq(plugins.id, castId<PluginId>("plugin_b2"))),
  ).toHaveLength(0);
});

test("plugin_kv: composite PK, key/value length CHECKs, pluginId CASCADE", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_c" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_c");
  const pluginId = castId<PluginId>("plugin_c");
  const now = 1000;

  await db.insert(plugins).values({
    id: pluginId,
    ownerId,
    slug: "kv-plugin",
    name: "KV Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "enabled",
    origin: "upload",
    installedAt: now,
    updatedAt: now,
  });

  await db.insert(pluginKv).values({ pluginId, ownerId, key: "counter", value: "1", updatedAt: now });

  // Composite PK: a dupe (pluginId, key) collides.
  await expect(db.insert(pluginKv).values({ pluginId, ownerId, key: "counter", value: "2", updatedAt: now })).rejects.toSatisfy(isConstraintErr);

  // The key-length CHECK rejects a key over 128 chars.
  await expect(db.insert(pluginKv).values({ pluginId, ownerId, key: "k".repeat(129), value: "x", updatedAt: now })).rejects.toSatisfy(isConstraintErr);

  // The value-length CHECK rejects a value over 64 KiB.
  await expect(db.insert(pluginKv).values({ pluginId, ownerId, key: "big", value: "v".repeat(65_537), updatedAt: now })).rejects.toSatisfy(isConstraintErr);

  // pluginId CASCADE: deleting the plugin wipes its KV rows.
  await db.delete(plugins).where(eq(plugins.id, pluginId));
  expect(await db.select().from(pluginKv).where(eq(pluginKv.pluginId, pluginId))).toHaveLength(0);
});
