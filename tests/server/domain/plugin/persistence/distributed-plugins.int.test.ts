// persistence: admin_distributed_plugins — the SERVER-WIDE published set (D147 clause (d)). Three properties
// that live in the SCHEMA rather than in a verb, and would each be a silent data bug if they drifted:
//
//   1. the slug PK — a re-publish REPLACES, never accumulates (one bundle per slug is the whole identity rule);
//   2. `distributedAt` is when the slug FIRST became policy and survives a re-publish, while `updatedAt` moves;
//   3. the bundle FK is ON DELETE CASCADE, deliberately the opposite of `plugins.bundle_asset_id`: assets are
//      per-user, so RESTRICT here would make the publishing admin's account undeletable by a policy row.

import { adminDistributedPlugins, assets } from "@orb/db";
import type { AssetId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import {
  deleteDistribution,
  getDistribution,
  listDistributions,
  toDistributedPluginView,
  upsertDistribution,
} from "../../../../../packages/server/src/domain/plugin/persistence/distributed-plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const FIRST_AT = 1_700_000_000_000;
const LATER_AT = 1_700_000_600_000;

/** A stored bundle asset owned by `ownerId` — the FK's target. */
async function seedAsset(db: Awaited<ReturnType<typeof freshDb>>, ownerId: UserId, id: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "plugin", mime: "application/zip", size: 12, hash: `hash-${id}`, uploadedAt: FIRST_AT });
  return assetId;
}

test("a re-publish REPLACES the record and keeps the original distributedAt", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const v1 = await seedAsset(db, boss, "asset_dist_v1");
  const v2 = await seedAsset(db, boss, "asset_dist_v2");

  await upsertDistribution(db, { slug: "house-style", name: "House Style", version: "1.0.0", bundleAssetId: v1, distributedBy: boss, now: FIRST_AT });
  await upsertDistribution(db, { slug: "house-style", name: "House Style II", version: "1.1.0", bundleAssetId: v2, distributedBy: boss, now: LATER_AT });

  const records = await listDistributions(db);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    slug: "house-style",
    name: "House Style II",
    version: "1.1.0",
    bundleAssetId: v2,
    // FIRST published then, updated now — the list a human reads is ordered by the former.
    distributedAt: FIRST_AT,
    updatedAt: LATER_AT,
  });
});

test("the view projects policy only — no asset id, no publisher", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const asset = await seedAsset(db, boss, "asset_dist_v1");
  await upsertDistribution(db, { slug: "house-style", name: "House Style", version: "1.0.0", bundleAssetId: asset, distributedBy: boss, now: FIRST_AT });

  const row = await getDistribution(db, "house-style");
  expect(row).toBeDefined();
  expect(toDistributedPluginView(row as NonNullable<typeof row>)).toEqual({
    slug: "house-style",
    name: "House Style",
    version: "1.0.0",
    distributedAt: FIRST_AT,
    updatedAt: FIRST_AT,
  });
});

test("deleting the record leaves the published asset alone; deleting the ASSET cascades the record away", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const asset = await seedAsset(db, boss, "asset_dist_v1");
  await upsertDistribution(db, { slug: "house-style", name: "House Style", version: "1.0.0", bundleAssetId: asset, distributedBy: boss, now: FIRST_AT });

  // WITHDRAW: the record goes, the admin's own upload stays (it is their asset, like any other).
  await deleteDistribution(db, "house-style");
  expect(await getDistribution(db, "house-style")).toBeUndefined();
  expect(await db.select().from(assets).where(eq(assets.id, asset))).toHaveLength(1);

  // The other direction — the CASCADE that makes the publishing admin deletable. RESTRICT here (the
  // `plugins.bundle_asset_id` posture) would refuse this delete and pin the account open forever.
  await upsertDistribution(db, { slug: "house-style", name: "House Style", version: "1.0.0", bundleAssetId: asset, distributedBy: boss, now: FIRST_AT });
  await db.delete(assets).where(eq(assets.id, asset));
  expect(await db.select().from(adminDistributedPlugins).where(eq(adminDistributedPlugins.slug, "house-style"))).toEqual([]);
});

test("deleting the publishing admin's account takes their distributions with them", async () => {
  const db = await freshDb();
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const asset = await seedAsset(db, boss, "asset_dist_v1");
  await upsertDistribution(db, { slug: "house-style", name: "House Style", version: "1.0.0", bundleAssetId: asset, distributedBy: boss, now: FIRST_AT });

  // A user hard-delete cascades their assets AND (through both FKs) this record — the honest consequence of
  // per-user CAS: a distribution cannot outlive the bytes it points at.
  await db.delete(assets).where(eq(assets.ownerId, boss));
  expect(await listDistributions(db)).toEqual([]);
});
