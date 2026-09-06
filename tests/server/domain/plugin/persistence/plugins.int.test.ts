// persistence: plugins — the `plugins`-row queries (02 §3). Owner-scoping is the load-bearing invariant
// (getById/getByOwnerSlug/listOwned never cross owners — a foreign id is undefined, no leak); the crash-counter
// increment/reset and the upgrade swap are the lifecycle writes crash-policy + upgrade drive. `toPluginView`
// lifts `builtAgainst` from the persisted manifest json (no column).

import type { PluginManifest } from "@orb/contracts/plugin";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
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
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1000;

/** "This build ships no showcase bundles" — the `toPluginView` shipped-slug argument for every read that is not
 *  about the `updateSource` projection itself (#1740). */
const NO_SHOWCASE: ReadonlySet<string> = new Set<string>();

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
    sourceUrl: null,
    installedAt: AT,
    updatedAt: AT,
  });
  return pluginId;
}

test("insert + getById is owner-scoped (a foreign owner sees undefined)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const pluginId = await seedPlugin(db, owner, "plugin_a");

  const mine = await getById(db, owner, pluginId);
  expect(mine?.slug).toBe("test-plugin");
  expect(await getById(db, other, pluginId)).toBeUndefined();
  expect(await getById(db, owner, castId<PluginId>("plugin_missing"))).toBeUndefined();
});

test("getByOwnerSlug resolves the (owner, slug) partition", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await seedPlugin(db, owner, "plugin_a", "alpha");

  expect((await getByOwnerSlug(db, owner, "alpha"))?.slug).toBe("alpha");
  expect(await getByOwnerSlug(db, owner, "beta")).toBeUndefined();
});

test("listOwned returns the owner's plugins newest-installed first", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
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
    sourceUrl: null,
    installedAt: AT + 100,
    updatedAt: AT + 100,
  });
  await seedPlugin(db, other, "plugin_c", "gamma");

  const rows = await listOwned(db, owner);
  expect(rows.map((r) => r.id)).toEqual([secondId, first]);
});

test("setStatus + setLastError stamp the lifecycle fields", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = await seedPlugin(db, owner, "plugin_a");

  await setStatus(db, pluginId, { status: "enabled", lastError: null, updatedAt: AT + 1 });
  expect((await getById(db, owner, pluginId))?.status).toBe("enabled");

  await setLastError(db, pluginId, "boom", AT + 2);
  const row = await getById(db, owner, pluginId);
  expect(row?.lastError).toBe("boom");
  expect(row?.status).toBe("enabled"); // setLastError does not touch status
});

test("incrementCrashes returns the count it produced AND the one it moved from; resetCrashes clears it", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = await seedPlugin(db, owner, "plugin_a");

  // The PAIR is what makes a threshold CROSSING observable: with the count alone, two crashes racing over the
  // auto-disable line look identical and both fire the owner's durable `plugin-disabled` notice.
  expect(await incrementCrashes(db, pluginId, AT + 1)).toStrictEqual({ previous: 0, count: 1 });
  expect(await incrementCrashes(db, pluginId, AT + 2)).toStrictEqual({ previous: 1, count: 2 });
  await resetCrashes(db, pluginId, AT + 3);
  expect((await getById(db, owner, pluginId))?.consecutiveCrashes).toBe(0);
});

test("applyUpgrade swaps the manifest-derived fields + grant + bundle asset", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = await seedPlugin(db, owner, "plugin_a");
  const newAsset = await seedBundleAsset(db, owner, "asset_new");

  await applyUpgrade(db, pluginId, {
    name: "Renamed",
    version: "1.2.0",
    manifest: manifest({ version: "1.2.0" }),
    bundleAssetId: newAsset,
    grantedCapabilities: ["chat.read", "storage.kv"],
    status: "disabled",
    pendingReconsent: true,
    widenedNetHosts: ["collector.attacker.example"],
    updatedAt: AT + 5,
  });
  const row = await getById(db, owner, pluginId);
  expect(row?.version).toBe("1.2.0");
  expect(row?.name).toBe("Renamed");
  expect(row?.bundleAssetId).toBe(newAsset);
  expect(row?.grantedCapabilities).toEqual(["chat.read", "storage.kv"]);
  // The write is what carries the system's own refusal forward — the verb decides the value, the row stores it.
  expect(row?.pendingReconsent).toBe(true);
  // …both halves of it: the flag says a re-consent stands, the delta says WHICH destinations it is about
  // (#659). They round-trip as json, like `grantedCapabilities`.
  expect(row?.widenedNetHosts).toEqual(["collector.attacker.example"]);
});

// #698 FAIL-OPEN GUARANTEE — the two DB-level facts the egress-withhold fix (`consentedNetHosts`) leans on.
// The withhold set an activation reads is the row's `widenedNetHosts`; the fix is only sound if that column
// can never be a stale-empty on a pending row whose reach IS unconsented, AND can never carry a mark on a
// settled row. The first is the verbs' job (upgrade's `pendingWidenedNetHosts` always records a widened host —
// pinned in the verb + grants suites); THIS is the second: the CHECK constraint makes a settled-but-marked row
// physically unwritable, so a `pendingReconsent === false` view always means an empty delta — no half-cleared
// state a reader could misjudge.
test("the widened_hosts CHECK rejects a SETTLED row that still carries a delta (pending=false + non-empty)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = await seedPlugin(db, owner, "plugin_ck");
  const newAsset = await seedBundleAsset(db, owner, "asset_ck");

  // The forbidden combination: the flag says "settled" while the delta still names a host. The delta moves in
  // lockstep with the flag — a settled row asserting a "New" mark is a lie — so the write must be rejected.
  await expect(
    applyUpgrade(db, pluginId, {
      name: "Test Plugin",
      version: "1.1.0",
      manifest: manifest({ version: "1.1.0" }),
      bundleAssetId: newAsset,
      grantedCapabilities: ["chat.read"],
      status: "disabled",
      pendingReconsent: false,
      widenedNetHosts: ["collector.attacker.example"],
      updatedAt: AT + 5,
    }),
  ).rejects.toThrow(); // drizzle wraps the CHECK as "Failed query …"; the CHECK text rides `.cause` (see below).

  // The write was REJECTED, not partially applied: the row is byte-for-byte the seeded 1.0.0, with the flag
  // cleared and the delta empty — the settled-with-marks state is physically unreachable.
  const row = await getById(db, owner, pluginId);
  expect(row?.version).toBe("1.0.0");
  expect(row?.pendingReconsent).toBe(false);
  expect(row?.widenedNetHosts).toEqual([]);
});

test("a fresh install writes an EMPTY delta and a CLEARED flag — a new row never spuriously withholds", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const pluginId = castId<PluginId>("plugin_fresh");
  const bundleAssetId = await seedBundleAsset(db, owner, "asset_fresh");
  await insertPlugin(db, {
    id: pluginId,
    ownerId: owner,
    slug: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    manifest: manifest(),
    bundleAssetId,
    grantedCapabilities: ["chat.read"],
    status: "disabled",
    origin: "upload",
    sourceUrl: null,
    installedAt: AT,
    updatedAt: AT,
  });
  const row = await getById(db, owner, pluginId);
  // insertPlugin hardcodes both — a reinstall at a slug an uninstall freed can never resurrect a stale delta,
  // and an activation of a fresh row withholds nothing (its declared reach is exactly what the owner just
  // granted at install).
  expect(row?.pendingReconsent).toBe(false);
  expect(row?.widenedNetHosts).toEqual([]);
});

test("deletePlugin removes the row; toPluginView lifts builtAgainst from the manifest", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    sourceUrl: null,
    installedAt: AT,
    updatedAt: AT,
  });

  const row = await getById(db, owner, pluginId);
  if (row === undefined) {
    throw new Error("seeded plugin row missing");
  }
  expect(toPluginView(row, NO_SHOWCASE).builtAgainst).toEqual({ engineVersion: "0.32.0" });
  // The `updateSource` projection (#1740) over the SAME row, both ways: an upload-origin row is un-updatable
  // when the build ships nothing under its slug, and IS a showcase row when it does. Nothing about the row
  // changes between the two reads — the shipped set is the whole oracle, which is exactly why it is injected.
  expect(toPluginView(row, NO_SHOWCASE).updateSource).toBeNull();
  expect(toPluginView(row, new Set(["test-plugin"])).updateSource).toBe("showcase");

  await deletePlugin(db, pluginId);
  expect(await getById(db, owner, pluginId)).toBeUndefined();
});
