// persistence: plugins — the `plugins`-row queries (02 §3). Owner-scoping is the load-bearing invariant
// (getById/getByOwnerSlug/listOwned never cross owners — a foreign id is undefined, no leak); the crash-counter
// increment/reset and the upgrade swap are the lifecycle writes crash-policy + upgrade drive. `toPluginView`
// lifts `builtAgainst` from the persisted manifest json (no column).

import type { PluginManifest } from "@orb/contracts/plugin";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  applyUpgrade,
  deletePlugin,
  getById,
  getByOwnerSlug,
  incrementCrashes,
  insertPlugin,
  listOwned,
  resetCrashes,
  setLastError,
  setStatus,
  toPluginView,
} from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const AT = 1000;

function manifest(
  overrides: { readonly id?: string; readonly version?: string; readonly builtAgainst?: { readonly engineVersion: string } } = {},
): PluginManifest {
  return pluginManifestSchema.parse({
    id: overrides.id ?? "test-plugin",
    name: "Test Plugin",
    version: overrides.version ?? "1.0.0",
    hostVersion: 1,
    entry: "main.js",
    description: "a test plugin",
    capabilities: ["chat.read"],
    ...(overrides.builtAgainst !== undefined ? { builtAgainst: overrides.builtAgainst } : {}),
  });
}

async function seedBundleAsset(db: Db, ownerId: UserId, id = "asset_bundle"): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "plugin", mime: "application/zip", size: 10, hash: `hash-${id}`, uploadedAt: AT });
  return assetId;
}

async function seedPlugin(db: Db, ownerId: UserId, id: string, slug = "test-plugin"): Promise<PluginId> {
  const pluginId = castId<PluginId>(id);
  const bundleAssetId = await seedBundleAsset(db, ownerId, `asset_${id}`);
  await insertPlugin(db, {
    id: pluginId,
    ownerId,
    slug,
    name: "Test Plugin",
    version: "1.0.0",
    manifest: manifest({ id: slug }),
    bundleAssetId,
    grantedCapabilities: ["chat.read"],
    status: "disabled",
    origin: "upload",
    installedAt: AT,
    updatedAt: AT,
  });
  return pluginId;
}

test("insert + getById is owner-scoped (a foreign owner sees undefined)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: "owner" });
  const other = await seedUser(db, { handle: "other" });
  const pluginId = await seedPlugin(db, owner, "plugin_a");

  const mine = await getById(db, owner, pluginId);
  expect(mine?.slug).toBe("test-plugin");
  expect(await getById(db, other, pluginId)).toBeUndefined();
  expect(await getById(db, owner, castId<PluginId>("plugin_missing"))).toBeUndefined();
});

test("getByOwnerSlug resolves the (owner, slug) partition", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: "owner" });
  await seedPlugin(db, owner, "plugin_a", "alpha");

  expect((await getByOwnerSlug(db, owner, "alpha"))?.slug).toBe("alpha");
  expect(await getByOwnerSlug(db, owner, "beta")).toBeUndefined();
});

test("listOwned returns the owner's plugins newest-installed first", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: "owner" });
  const other = await seedUser(db, { handle: "other" });
  const first = await seedPlugin(db, owner, "plugin_a", "alpha");
  // Second plugin installed later (higher installedAt) → sorts ahead.
  const secondId = castId<PluginId>("plugin_b");
  const secondAsset = await seedBundleAsset(db, owner, "asset_plugin_b");
  await insertPlugin(db, {
    id: secondId,
    ownerId: owner,
    slug: "beta",
    name: "Beta",
    version: "1.0.0",
    manifest: manifest({ id: "beta" }),
    bundleAssetId: secondAsset,
    grantedCapabilities: [],
    status: "disabled",
    origin: "upload",
    installedAt: AT + 100,
    updatedAt: AT + 100,
  });
  await seedPlugin(db, other, "plugin_c", "gamma");

  const rows = await listOwned(db, owner);
  expect(rows.map((r) => r.id)).toEqual([secondId, first]);
});

test("setStatus + setLastError stamp the lifecycle fields", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: "owner" });
  const pluginId = await seedPlugin(db, owner, "plugin_a");

  await setStatus(db, pluginId, { status: "enabled", lastError: null, updatedAt: AT + 1 });
  expect((await getById(db, owner, pluginId))?.status).toBe("enabled");

  await setLastError(db, pluginId, "boom", AT + 2);
  const row = await getById(db, owner, pluginId);
  expect(row?.lastError).toBe("boom");
  expect(row?.status).toBe("enabled"); // setLastError does not touch status
});

test("incrementCrashes returns the new count; resetCrashes clears it", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: "owner" });
  const pluginId = await seedPlugin(db, owner, "plugin_a");

  expect(await incrementCrashes(db, pluginId, AT + 1)).toBe(1);
  expect(await incrementCrashes(db, pluginId, AT + 2)).toBe(2);
  await resetCrashes(db, pluginId, AT + 3);
  expect((await getById(db, owner, pluginId))?.consecutiveCrashes).toBe(0);
});

test("applyUpgrade swaps the manifest-derived fields + grant + bundle asset", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: "owner" });
  const pluginId = await seedPlugin(db, owner, "plugin_a");
  const newAsset = await seedBundleAsset(db, owner, "asset_new");

  await applyUpgrade(db, pluginId, {
    name: "Renamed",
    version: "1.2.0",
    manifest: manifest({ version: "1.2.0" }),
    bundleAssetId: newAsset,
    grantedCapabilities: ["chat.read", "storage.kv"],
    status: "disabled",
    updatedAt: AT + 5,
  });
  const row = await getById(db, owner, pluginId);
  expect(row?.version).toBe("1.2.0");
  expect(row?.name).toBe("Renamed");
  expect(row?.bundleAssetId).toBe(newAsset);
  expect(row?.grantedCapabilities).toEqual(["chat.read", "storage.kv"]);
});

test("deletePlugin removes the row; toPluginView lifts builtAgainst from the manifest", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: "owner" });
  const pluginId = castId<PluginId>("plugin_ba");
  const bundleAssetId = await seedBundleAsset(db, owner, "asset_ba");
  await insertPlugin(db, {
    id: pluginId,
    ownerId: owner,
    slug: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    manifest: manifest({ builtAgainst: { engineVersion: "0.32.0" } }),
    bundleAssetId,
    grantedCapabilities: ["chat.read"],
    status: "disabled",
    origin: "upload",
    installedAt: AT,
    updatedAt: AT,
  });

  const row = await getById(db, owner, pluginId);
  if (row === undefined) {
    throw new Error("seeded plugin row missing");
  }
  expect(toPluginView(row).builtAgainst).toEqual({ engineVersion: "0.32.0" });

  await deletePlugin(db, pluginId);
  expect(await getById(db, owner, pluginId)).toBeUndefined();
});
