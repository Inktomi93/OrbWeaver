// persistence: plugin-kv — the `storage.kv` private plane (02 §3). Every op is scoped by BOTH plugin_id AND
// owner_id (the denormalized guard); the upsert is PK-idempotent and carries the key CEILING as a predicate
// inside its own statement (the host layer states the number); list prefix-filters. The cross-plugin
// isolation invariant: plugin A's keys are invisible to plugin B (the escape-suite property P6 pins, proven
// here at the query floor).

import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { deleteKv, getKv, listKv, upsertKvUnderCap } from "../../../../../packages/server/src/domain/plugin/persistence/plugin-kv.ts";
import { insertPlugin } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1000;
/** The ceiling these query-floor pins run under — the LIMIT is the host layer's policy (`PLUGIN_KV_MAX_KEYS`)
 *  and is passed in, so a persistence test states its own rather than importing a number it does not own. */
const TEST_MAX_KEYS = 8;

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
    sourceUrl: null,
    sourceCommit: null,
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
  await upsertKvUnderCap(db, scope, { key: "k", value: "v1", updatedAt: AT }, TEST_MAX_KEYS);
  expect(await getKv(db, scope, "k")).toBe("v1");
  // Idempotent PK (plugin_id, key): a second upsert overwrites, never a duplicate row.
  await upsertKvUnderCap(db, scope, { key: "k", value: "v2", updatedAt: AT + 1 }, TEST_MAX_KEYS);
  expect(await getKv(db, scope, "k")).toBe("v2");
  await deleteKv(db, scope, "k");
  expect(await getKv(db, scope, "k")).toBeNull();
});

test("list prefix-filters + sorts", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const scope = { pluginId: await seedPlugin(db, owner, "plugin_a", "alpha"), ownerId: owner };

  await upsertKvUnderCap(db, scope, { key: "cfg:a", value: "1", updatedAt: AT }, TEST_MAX_KEYS);
  await upsertKvUnderCap(db, scope, { key: "cfg:b", value: "2", updatedAt: AT }, TEST_MAX_KEYS);
  await upsertKvUnderCap(db, scope, { key: "state:x", value: "3", updatedAt: AT }, TEST_MAX_KEYS);

  expect(await listKv(db, scope)).toEqual(["cfg:a", "cfg:b", "state:x"]);
  expect(await listKv(db, scope, "cfg:")).toEqual(["cfg:a", "cfg:b"]);
});

// The ceiling, at the QUERY floor: it is inside the statement, so it cannot be raced, and the arm that keeps
// a full store usable — an overwrite consumes no slot — is part of the same predicate rather than a second
// branch that could disagree with it.
test("the key ceiling rides the write: a NEW key past it is refused, an EXISTING key still moves", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const scope = { pluginId: await seedPlugin(db, owner, "plugin_a", "alpha"), ownerId: owner };

  for (let i = 0; i < TEST_MAX_KEYS; i += 1) {
    expect(await upsertKvUnderCap(db, scope, { key: `k${String(i)}`, value: "v", updatedAt: AT }, TEST_MAX_KEYS)).toBe(true);
  }
  expect(await upsertKvUnderCap(db, scope, { key: "one-too-many", value: "v", updatedAt: AT }, TEST_MAX_KEYS)).toBe(false);
  expect(await getKv(db, scope, "one-too-many")).toBeNull();
  // …and the store is not bricked: an overwrite at the ceiling consumes no slot and always lands.
  expect(await upsertKvUnderCap(db, scope, { key: "k0", value: "updated", updatedAt: AT + 1 }, TEST_MAX_KEYS)).toBe(true);
  expect(await getKv(db, scope, "k0")).toBe("updated");
});

test("cross-plugin isolation: plugin A's keys are invisible to plugin B (same owner)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const a = { pluginId: await seedPlugin(db, owner, "plugin_a", "alpha"), ownerId: owner };
  const b = { pluginId: await seedPlugin(db, owner, "plugin_b", "beta"), ownerId: owner };

  await upsertKvUnderCap(db, a, { key: "secret", value: "a-only", updatedAt: AT }, TEST_MAX_KEYS);
  expect(await getKv(db, b, "secret")).toBeNull();
  expect(await listKv(db, b)).toEqual([]);
  expect(await getKv(db, a, "secret")).toBe("a-only");
});

test("the owner guard: a wrong owner in the scope reads nothing (belt vs a reused plugin id)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const pluginId = await seedPlugin(db, owner, "plugin_a", "alpha");

  await upsertKvUnderCap(db, { pluginId, ownerId: owner }, { key: "k", value: "v", updatedAt: AT }, TEST_MAX_KEYS);
  // Same plugin id, wrong owner → the guard column filters it out.
  expect(await getKv(db, { pluginId, ownerId: other }, "k")).toBeNull();
});

test("the owner guard covers the UPSERT too: a foreign-owner collision moves 0 rows", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const pluginId = await seedPlugin(db, owner, "plugin_a", "alpha");

  await upsertKvUnderCap(db, { pluginId, ownerId: owner }, { key: "k", value: "mine", updatedAt: AT }, TEST_MAX_KEYS);
  // The PK is (plugin_id, key) — it omits owner_id, so a foreign owner writing the same pair COLLIDES.
  // Without the DO UPDATE arm's owner belt the collision overwrote the value in place while the row kept its
  // original owner_id, so the victim's own owner-filtered read returned the attacker's value. The write is
  // REFUSED (0 rows), which the host layer surfaces as the cap error — the message is imprecise for this arm
  // and that is acceptable: a plugin_id belongs to exactly one installer, so nothing can reach it.
  expect(await upsertKvUnderCap(db, { pluginId, ownerId: other }, { key: "k", value: "theirs", updatedAt: AT + 1 }, TEST_MAX_KEYS)).toBe(false);
  expect(await getKv(db, { pluginId, ownerId: owner }, "k")).toBe("mine");
  expect(await getKv(db, { pluginId, ownerId: other }, "k")).toBeNull();
});
