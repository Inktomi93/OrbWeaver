// substrate: buildPluginStorage — the composed `storage.kv` host op (01 §2 / 02 §3). Wraps persistence/plugin-kv
// with the HOST-SIDE 256-key cap the DDL can't express, keyed by BOTH pluginId AND ownerId. Proves at the composed
// layer (over the real DB): the round-trip, the 256-key cap (new key refused, existing overwrite always allowed),
// and the cross-plugin isolation through the OP (not just the query floor) — plugin A's keys are invisible to B.

import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildPluginStorage, PLUGIN_KV_MAX_KEYS } from "../../../../../packages/server/src/domain/plugin/index.ts";
import { getKv } from "../../../../../packages/server/src/domain/plugin/persistence/plugin-kv.ts";
import { insertPlugin } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1000;
const now = (): number => AT;
const CAP_ERROR_RE = /256 keys/u;

async function seedPlugin(db: Db, ownerId: UserId, id: string, slug: string): Promise<PluginId> {
  const pluginId = castId<PluginId>(id);
  const assetId = castId<AssetId>(`asset_${id}`);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "plugin", mime: "application/zip", size: 10, hash: `hash-${id}`, uploadedAt: AT });
  await insertPlugin(db, {
    id: pluginId,
    ownerId,
    slug,
    name: slug,
    version: "1.0.0",
    manifest: pluginManifestSchema.parse({ id: slug, name: slug, version: "1.0.0", hostVersion: 1, entry: "main.js", description: "x", capabilities: [] }),
    bundleAssetId: assetId,
    grantedCapabilities: [],
    status: "disabled",
    origin: "upload",
    installedAt: AT,
    updatedAt: AT,
  });
  return pluginId;
}

test("set → get → list → delete round-trips through the composed op", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  expect(await storage.get(plugin, owner, "k")).toBeNull();
  await storage.set(plugin, owner, "cfg:a", "1");
  await storage.set(plugin, owner, "cfg:b", "2");
  expect(await storage.get(plugin, owner, "cfg:a")).toBe("1");
  expect(await storage.list(plugin, owner, "cfg:")).toEqual(["cfg:a", "cfg:b"]);
  await storage.delete(plugin, owner, "cfg:a");
  expect(await storage.get(plugin, owner, "cfg:a")).toBeNull();
});

test("the 256-key cap: a NEW key past the ceiling is refused; an EXISTING-key overwrite always proceeds", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  // Fill to the ceiling.
  for (let i = 0; i < PLUGIN_KV_MAX_KEYS; i++) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential seed — a serialized fill is fine for the cap fixture.
    await storage.set(plugin, owner, `k${i}`, "v");
  }
  // A NEW key past the cap is refused (typed error, contained as guest errors-as-data upstream).
  await expect(storage.set(plugin, owner, "one-too-many", "v")).rejects.toThrow(CAP_ERROR_RE);
  // An OVERWRITE of an existing key does NOT consume a slot — always allowed at the ceiling.
  await storage.set(plugin, owner, "k0", "updated");
  expect(await storage.get(plugin, owner, "k0")).toBe("updated");
});

test("cross-plugin isolation through the op: plugin A's key is invisible to plugin B (same owner)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const a = await seedPlugin(db, owner, "plugin_a", "alpha");
  const b = await seedPlugin(db, owner, "plugin_b", "beta");
  const storage = buildPluginStorage(db, now);

  await storage.set(a, owner, "secret", "a-only");
  expect(await storage.get(b, owner, "secret")).toBeNull();
  expect(await storage.list(b, owner, undefined)).toEqual([]);
  expect(await storage.get(a, owner, "secret")).toBe("a-only");
  // The row IS keyed to A (the guard column is real, not just an app filter).
  expect(await getKv(db, { pluginId: a, ownerId: owner }, "secret")).toBe("a-only");
});
