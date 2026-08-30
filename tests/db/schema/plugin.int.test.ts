// plugin.int — schema/plugin (plugins + plugin_assets + plugin_kv) against a real libSQL :memory: db (FK
// PRAGMA ON).
// Covers: plugins round-trip (manifest/grantedCapabilities json); unique(ownerId, slug); status CHECK
// (derives PLUGIN_STATUSES); bundleAssetId RESTRICT (a live install blocks the bundle's asset delete);
// owner CASCADE (deleting the owner drops their plugins); plugin_assets composite PK + BOTH CASCADEs (#802 —
// the fetched-cover register, deliberately not RESTRICT); plugin_kv composite PK + key/value length
// CHECKs + pluginId CASCADE.

import type { PluginCapability, PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_ORIGINS, PLUGIN_STATUSES, pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, pluginAssets, pluginKv, plugins, users } from "@orb/db";
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

test("origin enum mirrors PLUGIN_ORIGINS (derives the tuple, never re-spells)", () => {
  expect(plugins.origin.enumValues).toEqual([...PLUGIN_ORIGINS]);
});

test("the source_url CHECK pairs origin with source_url: upload ⟺ null, url ⟺ non-null (U8 2b)", async () => {
  // The physics tier of the `origin ⟺ source_url` invariant. `upload` is the ONE origin with no remembered URL;
  // every other origin (today `url`) MUST carry one, because the whole point of a non-upload origin is the source
  // the auto update-check re-fetches. The CHECK makes the two broken combinations UNWRITABLE, so a future writer
  // that records a `url` install with no URL (breaking the update-check) or an `upload` with a stray URL gets a
  // constraint violation, not a silently-wrong row.
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_src" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_src");
  const base = {
    ownerId,
    name: "Src Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "disabled" as const,
    installedAt: 1000,
    updatedAt: 1000,
  };

  // PLANTED POSITIVE CONTROLS — both broken combinations are refused.
  await expect(
    db.insert(plugins).values({ ...base, id: castId<PluginId>("plugin_src_bad1"), slug: "src-bad-1", origin: "url", sourceUrl: null }),
  ).rejects.toSatisfy(isConstraintErr); // a `url` install with no remembered URL — the update-check would have nothing to fetch
  await expect(
    db.insert(plugins).values({ ...base, id: castId<PluginId>("plugin_src_bad2"), slug: "src-bad-2", origin: "upload", sourceUrl: "https://x.example/p.zip" }),
  ).rejects.toSatisfy(isConstraintErr); // an `upload` install carrying a stray URL

  // …and both legitimate shapes pass — so the CHECK is a pairing guard, not a blanket refusal.
  await db.insert(plugins).values({ ...base, id: castId<PluginId>("plugin_src_upload"), slug: "src-upload", origin: "upload", sourceUrl: null });
  await db.insert(plugins).values({ ...base, id: castId<PluginId>("plugin_src_url"), slug: "src-url", origin: "url", sourceUrl: "https://x.example/p.zip" });
  const urlRows = await db
    .select()
    .from(plugins)
    .where(eq(plugins.id, castId<PluginId>("plugin_src_url")));
  expect(urlRows[0]?.origin).toBe("url");
  expect(urlRows[0]?.sourceUrl).toBe("https://x.example/p.zip");
});

test("the widened-hosts CHECK refuses a SETTLED row that still carries a re-consent delta", async () => {
  // #659, the physics tier of the delta's lifecycle. `widened_net_hosts` names WHICH destinations a pending
  // re-consent added, and it is what a notice marks "New" — a row with the flag DOWN and marks still on it
  // would put a claim on a consent surface about an ask nobody is being asked about. The verbs clear the two
  // together (one `refusalAfter*` decision each); this makes the other combination unwritable, so a future
  // writer that forgets gets a constraint violation instead of a badge that lies.
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_d" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_d");
  const base = {
    ownerId,
    slug: "delta-plugin",
    name: "Delta Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "disabled" as const,
    origin: "upload" as const,
    installedAt: 1000,
    updatedAt: 1000,
  };

  // PLANTED POSITIVE CONTROL: the settled-but-marked row the verbs must never write.
  await expect(
    db.insert(plugins).values({ ...base, id: castId<PluginId>("plugin_d_bad"), pendingReconsent: false, widenedNetHosts: ["collector.attacker.example"] }),
  ).rejects.toSatisfy(isConstraintErr);

  // …and both legitimate shapes pass, so the CHECK is a lifecycle guard and not a blanket refusal.
  await db
    .insert(plugins)
    .values({ ...base, id: castId<PluginId>("plugin_d_pending"), pendingReconsent: true, widenedNetHosts: ["collector.attacker.example"] });
  await db.insert(plugins).values({ ...base, id: castId<PluginId>("plugin_d_settled"), slug: "delta-plugin-2", pendingReconsent: false });
  expect(
    (
      await db
        .select()
        .from(plugins)
        .where(eq(plugins.id, castId<PluginId>("plugin_d_settled")))
    )[0]?.widenedNetHosts,
  ).toEqual([]);

  // Clearing the flag while the marks stand is the same violation on the UPDATE path (a `setGrant` that
  // moved one column and forgot the other), which is where it would actually be reached.
  await expect(
    db
      .update(plugins)
      .set({ pendingReconsent: false })
      .where(eq(plugins.id, castId<PluginId>("plugin_d_pending"))),
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

// #802 — the fetched-asset register. Its DDL is what makes a `net.fetchAsset` cover survive GC, so the two
// CASCADEs are the whole lifecycle: the link dies with the install (covers become reap-eligible again) and it
// dies with the asset (this row is a cache index, never a reason a blob is un-deletable — the opposite of
// `bundle_asset_id`'s RESTRICT, which the arm above pins).
test("plugin_assets: composite PK, pluginId CASCADE, assetId CASCADE (never RESTRICT)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_e" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_e");
  const coverAssetId = await seedAsset(db, ownerId, "asset_plugin_e_cover");
  const pluginId = castId<PluginId>("plugin_e");
  const now = 1000;

  await db.insert(plugins).values({
    id: pluginId,
    ownerId,
    slug: "fetch-plugin",
    name: "Fetch Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "enabled",
    origin: "upload",
    installedAt: now,
    updatedAt: now,
  });
  await db.insert(pluginAssets).values({ pluginId, assetId: coverAssetId, fetchedAt: now });

  // Composite PK: the same (plugin, asset) pair cannot be recorded twice (the re-fetch upsert's target).
  await expect(db.insert(pluginAssets).values({ pluginId, assetId: coverAssetId, fetchedAt: now + 1 })).rejects.toSatisfy(isConstraintErr);

  // assetId CASCADE — the link never blocks the asset delete (contrast `bundle_asset_id` RESTRICT above).
  await db.delete(assets).where(eq(assets.id, coverAssetId));
  expect(await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId))).toHaveLength(0);

  // pluginId CASCADE — uninstall drops the links, which is what makes the covers reap-eligible again.
  const secondCover = await seedAsset(db, ownerId, "asset_plugin_e_cover2");
  await db.insert(pluginAssets).values({ pluginId, assetId: secondCover, fetchedAt: now });
  await db.delete(plugins).where(eq(plugins.id, pluginId));
  expect(await db.select().from(pluginAssets).where(eq(pluginAssets.assetId, secondCover))).toHaveLength(0);
  // …and the asset row itself SURVIVES the cascade (GC decides its fate, not the FK).
  expect(await db.select().from(assets).where(eq(assets.id, secondCover))).toHaveLength(1);
});

// #820 — the bundle-shipped half of the SAME register. The three arms below are the reason `bundle_path` is
// in the PRIMARY KEY rather than being a nullable annotation on it.
test("plugin_assets: bundle_path is in the PK — two paths sharing ONE deduped asset both survive", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_f" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_f");
  const spriteId = await seedAsset(db, ownerId, "asset_plugin_f_sprite");
  const pluginId = castId<PluginId>("plugin_f");
  const now = 1000;

  await db.insert(plugins).values({
    id: pluginId,
    ownerId,
    slug: "sprite-plugin",
    name: "Sprite Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "enabled",
    origin: "upload",
    installedAt: now,
    updatedAt: now,
  });

  // THE COLLISION THE PK WIDENING EXISTS FOR: the CAS is content-addressed, so a bundle shipping the same
  // image at two paths gets ONE assetId back. Under the original (plugin_id, asset_id) key the second row
  // would violate the PK and the second path would resolve to nothing forever.
  await db.insert(pluginAssets).values({ pluginId, assetId: spriteId, bundlePath: "ui/assets/happy.png", fetchedAt: now });
  await db.insert(pluginAssets).values({ pluginId, assetId: spriteId, bundlePath: "ui/assets/also-happy.png", fetchedAt: now });
  expect(await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId))).toHaveLength(2);

  // …and the SAME (plugin, asset, path) triple still cannot be recorded twice — the upsert's target.
  await expect(db.insert(pluginAssets).values({ pluginId, assetId: spriteId, bundlePath: "ui/assets/happy.png", fetchedAt: now + 1 })).rejects.toSatisfy(
    isConstraintErr,
  );

  // A RUNTIME-fetched cover (#802, the `''` sentinel) coexists with the bundle rows for the same bytes: the
  // two provenances share a table but never overwrite each other.
  await db.insert(pluginAssets).values({ pluginId, assetId: spriteId, bundlePath: "", fetchedAt: now });
  expect(await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId))).toHaveLength(3);
});

test("plugin_assets: the bundle_path CHECK refuses free text — only the sentinel or a ui/assets/ path", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_plugin_g" });
  const bundleAssetId = await seedAsset(db, ownerId, "asset_plugin_g");
  const spriteId = await seedAsset(db, ownerId, "asset_plugin_g_sprite");
  const pluginId = castId<PluginId>("plugin_g");
  const now = 1000;

  await db.insert(plugins).values({
    id: pluginId,
    ownerId,
    slug: "check-plugin",
    name: "Check Plugin",
    version: "1.0.0",
    manifest: MANIFEST,
    bundleAssetId,
    grantedCapabilities: GRANTS,
    status: "enabled",
    origin: "upload",
    installedAt: now,
    updatedAt: now,
  });

  // The column is the ONE key a UI node resolves against, so a writer that stamped an arbitrary string here
  // would put a name the funnel never admitted into the resolution namespace. The CHECK is the physics tier.
  for (const bundlePath of ["../../etc/passwd", "main.js", "https://evil.example/x.png", "assets/a.png"]) {
    await expect(db.insert(pluginAssets).values({ pluginId, assetId: spriteId, bundlePath, fetchedAt: now }), bundlePath).rejects.toSatisfy(isConstraintErr);
  }
  // …and both LEGAL spellings are writable.
  await db.insert(pluginAssets).values({ pluginId, assetId: spriteId, bundlePath: "ui/assets/a.png", fetchedAt: now });
  await db.insert(pluginAssets).values({ pluginId, assetId: spriteId, bundlePath: "", fetchedAt: now });
  expect(await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId))).toHaveLength(2);
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

  // The value CHECK caps at 64 KiB of BYTES, not characters. A legitimate at-cap ASCII value passes…
  await db.insert(pluginKv).values({ pluginId, ownerId, key: "at-cap", value: "v".repeat(65_536), updatedAt: now });
  // …one byte over is refused…
  await expect(db.insert(pluginKv).values({ pluginId, ownerId, key: "big", value: "v".repeat(65_537), updatedAt: now })).rejects.toSatisfy(isConstraintErr);
  // …and so is a value UNDER the cap in characters but OVER it in bytes: 3-byte UTF-8 chars, 30 000
  // characters ≈ 90 000 bytes. A bare length() on TEXT counts characters and would admit this.
  await expect(db.insert(pluginKv).values({ pluginId, ownerId, key: "multibyte", value: "€".repeat(30_000), updatedAt: now })).rejects.toSatisfy(
    isConstraintErr,
  );

  // pluginId CASCADE: deleting the plugin wipes its KV rows.
  await db.delete(plugins).where(eq(plugins.id, pluginId));
  expect(await db.select().from(pluginKv).where(eq(pluginKv.pluginId, pluginId))).toHaveLength(0);
});
