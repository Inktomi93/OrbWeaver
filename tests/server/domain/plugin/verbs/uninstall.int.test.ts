// verb: uninstall — remove an installed plugin (02 §4). Deactivate (dispose the resident) → delete the row
// (KV + the #802 fetched-asset links cascade) → reap the bundle asset AND the covers this install was
// retaining. The end state is zero rows, zero KV, zero bundle bytes, and no orphaned plugin art.

import type { Db } from "@orb/db";
import { assets, pluginAssets, pluginKv } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError, recordPluginFetchedAsset } from "@orb/server/domain/plugin";
import { eq } from "drizzle-orm";
import { upsertKv } from "../../../../../packages/server/src/domain/plugin/persistence/plugin-kv.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

/** A cover the way `net.fetchAsset` lands one: an owned `generated` asset in the installer's CAS index, with
 *  no referencing row until the fetch link is recorded. */
async function seedFetchedAsset(db: Db, ownerId: UserId, id: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "generated", mime: "image/png", size: 10, hash: `hash-${id}`, uploadedAt: 1000 });
  return assetId;
}

test("uninstall leaves zero rows, zero KV, zero bundle bytes; disposes a resident instance", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["storage.kv"] }),
    grant: ["storage.kv"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  // Seed a KV row so the CASCADE is observable.
  await upsertKv(db, { pluginId: installed.id, ownerId: owner }, { key: "k", value: "v", updatedAt: 1000 });

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: installed.id });

  expect(h.port.disposed.length).toBe(1); // the resident instance was torn down
  expect(await h.service.list({ caller: ownerPrincipalFor(owner) })).toEqual([]); // row gone
  expect(h.storedBytes.size).toBe(0); // bundle asset reaped
  const kv = await db.select().from(pluginKv).where(eq(pluginKv.pluginId, installed.id));
  expect(kv).toEqual([]); // KV cascaded off the FK
});

// #802 — uninstall knows exactly which covers it just orphaned (it reads the `plugin_assets` links BEFORE the
// delete cascades them away), so it reaps them itself instead of leaving GBs of art for the scheduled sweep.
// The second half is the containment: a cover a SECOND plugin also fetched is still referenced and survives.
test("uninstall reaps the plugin's fetched assets too — but never one another plugin still references", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const atlas = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "atlas" }), grant: [] });
  const other = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "other" }), grant: [] });
  // Two covers `net.fetchAsset` landed in the installer's CAS: one only atlas fetched, one both did (the CAS
  // is content-addressed, so two plugins pulling the same image share ONE assetId).
  const solo = await seedFetchedAsset(db, owner, "asset_cover_solo");
  const shared = await seedFetchedAsset(db, owner, "asset_cover_shared");
  await recordPluginFetchedAsset(db, atlas.id, solo, 1000);
  await recordPluginFetchedAsset(db, atlas.id, shared, 1000);
  await recordPluginFetchedAsset(db, other.id, shared, 1000);

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: atlas.id });

  expect(await db.select().from(assets).where(eq(assets.id, solo))).toHaveLength(0); // reaped with the install
  expect(await db.select().from(assets).where(eq(assets.id, shared))).toHaveLength(1); // still `other`'s
  expect(await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, atlas.id))).toEqual([]); // links cascaded
});

test("uninstalling a disabled plugin needs no instance (idempotent deactivate)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "mood" }), grant: [] });

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  expect(h.port.disposed.length).toBe(0);
  expect(h.storedBytes.size).toBe(0);
});

test("uninstall takes the standing re-consent with it — a REINSTALL at the same slug starts clean", async () => {
  // #659's clear-at-uninstall arm. There is no clear-at-uninstall WRITE to add and there must not be:
  // `deletePlugin` drops the row, so `pending_reconsent` and `widened_net_hosts` die with it. The arm that
  // could actually resurrect a stale badge is the REINSTALL — a new row for the same (owner, slug) — so
  // that is what this pins. A delta that survived here would badge a host as "new in this update" on a row
  // whose only update was the person choosing this exact grant, seconds ago.
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["net.fetch"], netHosts: ["api.vendor.example"] }),
    grant: ["net.fetch"],
  });
  const upgraded = await h.service.upgrade({
    caller: ownerPrincipalFor(owner),
    pluginId: installed.id,
    bundle: makeBundle({ id: "mood", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
  });
  expect(upgraded.reconsentPending).toBe(true);
  expect(upgraded.widenedNetHosts).toEqual(["collector.attacker.example"]);

  await h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: installed.id });
  // The same bundle, installed again — the reach the notice was about, now chosen deliberately.
  const reinstalled = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", version: "1.1.0", capabilities: ["net.fetch"], netHosts: ["api.vendor.example", "collector.attacker.example"] }),
    grant: ["net.fetch"],
  });

  expect(reinstalled.id).not.toBe(installed.id); // a NEW row, not a resurrected one
  expect(reinstalled.reconsentPending).toBe(false);
  expect(reinstalled.widenedNetHosts).toEqual([]);
  // …and the read-back row agrees with the install's own return (one projection, two paths).
  const [row] = await h.service.list({ caller: ownerPrincipalFor(owner) });
  expect(row?.widenedNetHosts).toEqual([]);
});

test("a missing plugin id is a leak-free NotFound", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  await expect(h.service.uninstall({ caller: ownerPrincipalFor(owner), pluginId: castId<PluginId>("plugin_missing") })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
});

test("a plain user (role:'user') uninstalls their OWN plugin — D147", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const user = await seedUser(db, { handle: castId<Handle>("user") });
  const installed = await h.service.install({ caller: principalFor(user), bundle: makeBundle({ id: "mine" }), grant: [] });

  await h.service.uninstall({ caller: principalFor(user), pluginId: installed.id });

  expect(await h.service.list({ caller: principalFor(user) })).toEqual([]);
});

// The DESTRUCTIVE cross-user arm. `uninstall` returns void, so a silent write-IDOR leaves no error to read —
// the evidence is that A's row, A's KV and A's bundle bytes all SURVIVED the stranger's call. Both a plain
// user and the apex role are refused identically: there is no admin any-row branch (D147).
test("a stranger cannot uninstall another user's plugin — the row, its KV and its bundle all survive", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alice = await seedUser(db, { handle: castId<Handle>("alice") });
  const bob = await seedUser(db, { handle: castId<Handle>("bob") });
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const hers = await h.service.install({
    caller: principalFor(alice),
    bundle: makeBundle({ id: "mood", capabilities: ["storage.kv"] }),
    grant: ["storage.kv"],
  });
  await upsertKv(db, { pluginId: hers.id, ownerId: alice }, { key: "k", value: "v", updatedAt: 1000 });

  await expect(h.service.uninstall({ caller: principalFor(bob), pluginId: hers.id })).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(h.service.uninstall({ caller: ownerPrincipalFor(boss), pluginId: hers.id })).rejects.toBeInstanceOf(PluginNotFoundError);

  expect((await h.service.list({ caller: principalFor(alice) })).map((p) => p.id)).toEqual([hers.id]);
  expect(await db.select().from(pluginKv).where(eq(pluginKv.pluginId, hers.id))).toHaveLength(1);
  expect(h.storedBytes.size).toBe(1); // the bundle asset was never reaped out from under A
});
