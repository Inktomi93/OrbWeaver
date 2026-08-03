// persistence: plugin-kv — the `storage.kv` private plane (02 §3). Every op is scoped by BOTH plugin_id AND
// owner_id (the denormalized guard); upsert is PK-idempotent; list prefix-filters; count is the 256-key cap
// source. The cross-plugin isolation invariant: plugin A's keys are invisible to plugin B (the escape-suite
// property P6 pins, proven here at the query floor).

import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { countKeys, deleteKv, getKv, listKv, upsertKv } from "../../../../../packages/server/src/domain/plugin/persistence/plugin-kv.ts";
import { insertPlugin } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1000;

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

test("upsert → get → delete round-trips one key", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const scope = { pluginId: await seedPlugin(db, owner, "plugin_a", "alpha"), ownerId: owner };

  expect(await getKv(db, scope, "k")).toBeNull();
  await upsertKv(db, scope, { key: "k", value: "v1", updatedAt: AT });
  expect(await getKv(db, scope, "k")).toBe("v1");
  // Idempotent PK (plugin_id, key): a second upsert overwrites, never a duplicate row.
  await upsertKv(db, scope, { key: "k", value: "v2", updatedAt: AT + 1 });
  expect(await getKv(db, scope, "k")).toBe("v2");
  await deleteKv(db, scope, "k");
  expect(await getKv(db, scope, "k")).toBeNull();
});

test("list prefix-filters + sorts; count is the key total", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const scope = { pluginId: await seedPlugin(db, owner, "plugin_a", "alpha"), ownerId: owner };

  await upsertKv(db, scope, { key: "cfg:a", value: "1", updatedAt: AT });
  await upsertKv(db, scope, { key: "cfg:b", value: "2", updatedAt: AT });
  await upsertKv(db, scope, { key: "state:x", value: "3", updatedAt: AT });

  expect(await listKv(db, scope)).toEqual(["cfg:a", "cfg:b", "state:x"]);
  expect(await listKv(db, scope, "cfg:")).toEqual(["cfg:a", "cfg:b"]);
  expect(await countKeys(db, scope)).toBe(3);
});

test("cross-plugin isolation: plugin A's keys are invisible to plugin B (same owner)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const a = { pluginId: await seedPlugin(db, owner, "plugin_a", "alpha"), ownerId: owner };
  const b = { pluginId: await seedPlugin(db, owner, "plugin_b", "beta"), ownerId: owner };

  await upsertKv(db, a, { key: "secret", value: "a-only", updatedAt: AT });
  expect(await getKv(db, b, "secret")).toBeNull();
  expect(await listKv(db, b)).toEqual([]);
  expect(await getKv(db, a, "secret")).toBe("a-only");
});

test("the owner guard: a wrong owner in the scope reads nothing (belt vs a reused plugin id)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const pluginId = await seedPlugin(db, owner, "plugin_a", "alpha");

  await upsertKv(db, { pluginId, ownerId: owner }, { key: "k", value: "v", updatedAt: AT });
  // Same plugin id, wrong owner → the guard column filters it out.
  expect(await getKv(db, { pluginId, ownerId: other }, "k")).toBeNull();
});

test("the owner guard covers the UPSERT too: a foreign-owner collision moves 0 rows", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const pluginId = await seedPlugin(db, owner, "plugin_a", "alpha");

  await upsertKv(db, { pluginId, ownerId: owner }, { key: "k", value: "mine", updatedAt: AT });
  // The PK is (plugin_id, key) — it omits owner_id, so a foreign owner writing the same pair COLLIDES.
  // Without the `setWhere` belt the DO UPDATE arm overwrote the value in place while the row kept its
  // original owner_id, so the victim's own owner-filtered read returned the attacker's value.
  await upsertKv(db, { pluginId, ownerId: other }, { key: "k", value: "theirs", updatedAt: AT + 1 });
  expect(await getKv(db, { pluginId, ownerId: owner }, "k")).toBe("mine");
  expect(await getKv(db, { pluginId, ownerId: other }, "k")).toBeNull();
});
