// .int tests for schema/gallery (D49 #2 / PD-55 — the curated per-character media layer). Real libSQL
// :memory: via freshDb (FK PRAGMA ON). Covers the constraint semantics no other test pins: the
// `unique(assetId, subjectCharacterId)` with NULL-distinct subjects (duplicate un-charactered adds stay
// possible; a duplicate WITH the same subject is rejected); `subjectCharacterId SET NULL` survival on a
// character delete; `assetId` CASCADE (deleting the image erases its gallery rows); and
// owner-derivation-through-the-asset-FK (NO ownerId column — owner reaches via assetId → assets.ownerId).

import type { Db } from "@orb/db";
import { assets, characters, galleryItems } from "@orb/db";
import type { AssetId, CharacterId, GalleryItemId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: `card-${id}`,
    ownerId,
    contentHash: "hash",
    name: "Card",
  });
  return characterId;
}

async function seedAsset(db: Db, ownerId: UserId, id: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "gallery",
    mime: "image/webp",
    size: 100,
    hash: id.padEnd(64, "0"),
  });
  return assetId;
}

test("gallery_items: unique(assetId, subjectCharacterId) REJECTS a duplicate charactered add", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_a", handle: "gal-a" });
  const characterId = await seedCharacter(db, ownerId, "character_gal_a");
  const assetId = await seedAsset(db, ownerId, "asset_gal_a");

  await db.insert(galleryItems).values({
    id: castId<GalleryItemId>("gallery_item_gal_a1"),
    assetId,
    subjectCharacterId: characterId,
  });
  // Same (asset, subject) again — the unique index conflicts.
  await expect(
    db.insert(galleryItems).values({
      id: castId<GalleryItemId>("gallery_item_gal_a2"),
      assetId,
      subjectCharacterId: characterId,
    }),
  ).rejects.toThrow();
});

test("gallery_items: NULL subjects are DISTINCT — duplicate un-charactered adds stay possible", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_b", handle: "gal-b" });
  const assetId = await seedAsset(db, ownerId, "asset_gal_b");

  await db.insert(galleryItems).values({
    id: castId<GalleryItemId>("gallery_item_gal_b1"),
    assetId,
  });
  // Second un-charactered row on the SAME asset — SQLite treats NULL subjects as distinct, so no conflict.
  await db.insert(galleryItems).values({
    id: castId<GalleryItemId>("gallery_item_gal_b2"),
    assetId,
  });

  const rows = await db.select().from(galleryItems).where(eq(galleryItems.assetId, assetId));
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.subjectCharacterId === null)).toBe(true);
});

test("gallery_items: character delete SET NULLs the subject (item survives un-charactered)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_c", handle: "gal-c" });
  const characterId = await seedCharacter(db, ownerId, "character_gal_c");
  const assetId = await seedAsset(db, ownerId, "asset_gal_c");
  const itemId = castId<GalleryItemId>("gallery_item_gal_c");
  await db.insert(galleryItems).values({ id: itemId, assetId, subjectCharacterId: characterId });

  await db.delete(characters).where(eq(characters.id, characterId));

  const rows = await db.select().from(galleryItems).where(eq(galleryItems.id, itemId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.subjectCharacterId).toBeNull();
});

test("gallery_items: asset delete CASCADEs the item (never a dangling curation row)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_d", handle: "gal-d" });
  const assetId = await seedAsset(db, ownerId, "asset_gal_d");
  await db
    .insert(galleryItems)
    .values({ id: castId<GalleryItemId>("gallery_item_gal_d"), assetId });

  await db.delete(assets).where(eq(assets.id, assetId));
  expect(
    await db.select().from(galleryItems).where(eq(galleryItems.assetId, assetId)),
  ).toHaveLength(0);
});

test("gallery_items: owner DERIVES through the asset FK (no ownerId column)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_e", handle: "gal-e" });
  const otherOwner = await seedUser(db, { id: "user_gal_e2", handle: "gal-e2" });
  const assetId = await seedAsset(db, ownerId, "asset_gal_e");
  await db
    .insert(galleryItems)
    .values({ id: castId<GalleryItemId>("gallery_item_gal_e"), assetId });

  // The gallery row carries no ownerId; the owner is reachable via assetId → assets.ownerId only.
  const [row] = await db
    .select({ derivedOwner: assets.ownerId })
    .from(galleryItems)
    .innerJoin(assets, eq(galleryItems.assetId, assets.id))
    .where(eq(galleryItems.assetId, assetId));
  expect(row?.derivedOwner).toBe(ownerId);
  expect(row?.derivedOwner).not.toBe(otherOwner);
});
