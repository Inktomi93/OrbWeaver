// .int tests for schema/gallery (D49 #2 — the curated per-character media layer). Real libSQL
// :memory: via freshDb (FK PRAGMA ON). Covers the constraint semantics no other test pins: the
// `unique(assetId, subjectCharacterId)` with NULL-distinct subjects (duplicate un-charactered adds stay
// possible; a duplicate WITH the same subject is rejected); `subjectCharacterId SET NULL` survival on a
// character delete; `assetId` CASCADE (deleting the image erases its gallery rows); and
// owner-derivation-through-the-asset-FK (NO ownerId column — owner reaches via assetId → assets.ownerId).

import type { Db } from "@orb/db";
import { assets, characters, galleryItems } from "@orb/db";
import type { AssetId, CharacterHandle, CharacterId, GalleryItemId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedUser } from "./_support.ts";

async function seedCharacter(db: Db, ownerId: UserId, id: string): Promise<CharacterId> {
  const characterId = castId<CharacterId>(id);
  await db.insert(characters).values({
    id: characterId,
    handle: castId<CharacterHandle>(`card-${id}`),
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
  const ownerId = await seedUser(db, { id: "user_gal_a", handle: castId<Handle>("gal-a") });
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

// PREMISE FLIPPED (#1375). This used to pin "NULL subjects are DISTINCT — duplicate un-charactered adds
// stay possible", which is SQLite's default and was true of the composite index alone. But one layer up,
// `addToGallery` documents itself as idempotent, and the product answer is that an asset appears ONCE in
// the unscoped gallery — so the storage layer now carries a PARTIAL unique index that says so, and the
// verb's conflict guard finally has a target that fires on the common path.
test("gallery_items: the partial unique index makes un-charactered rows unique per asset", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_b", handle: castId<Handle>("gal-b") });
  const assetId = await seedAsset(db, ownerId, "asset_gal_b");

  await db.insert(galleryItems).values({
    id: castId<GalleryItemId>("gallery_item_gal_b1"),
    assetId,
  });
  // Second un-charactered row on the SAME asset — the composite index cannot see it (NULLs are distinct),
  // `gallery_items_asset_unsubjected_unique` can.
  await expect(
    db.insert(galleryItems).values({
      id: castId<GalleryItemId>("gallery_item_gal_b2"),
      assetId,
    }),
  ).rejects.toThrow();

  const rows = await db.select().from(galleryItems).where(eq(galleryItems.assetId, assetId));
  expect(rows).toHaveLength(1);
  expect(rows.every((r) => r.subjectCharacterId === null)).toBe(true);
});

// A FENCE, not a defect proof (it passes pre-fix): the partial index is SCOPED to the NULL half, so the
// same asset may still carry one row per character.
test("gallery_items: a character-scoped row coexists with the un-charactered one for the same asset", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_b2", handle: castId<Handle>("gal-b2") });
  const characterId = await seedCharacter(db, ownerId, "character_gal_b2");
  const assetId = await seedAsset(db, ownerId, "asset_gal_b2");

  await db.insert(galleryItems).values({ id: castId<GalleryItemId>("gallery_item_gal_b3"), assetId });
  await db.insert(galleryItems).values({ id: castId<GalleryItemId>("gallery_item_gal_b4"), assetId, subjectCharacterId: characterId });

  const rows = await db.select().from(galleryItems).where(eq(galleryItems.assetId, assetId));
  expect(rows).toHaveLength(2);
});

test("gallery_items: character delete SET NULLs the subject (item survives un-charactered)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_c", handle: castId<Handle>("gal-c") });
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
  const ownerId = await seedUser(db, { id: "user_gal_d", handle: castId<Handle>("gal-d") });
  const assetId = await seedAsset(db, ownerId, "asset_gal_d");
  await db.insert(galleryItems).values({ id: castId<GalleryItemId>("gallery_item_gal_d"), assetId });

  await db.delete(assets).where(eq(assets.id, assetId));
  expect(await db.select().from(galleryItems).where(eq(galleryItems.assetId, assetId))).toHaveLength(0);
});

test("gallery_items: owner DERIVES through the asset FK (no ownerId column)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_gal_e", handle: castId<Handle>("gal-e") });
  const otherOwner = await seedUser(db, { id: "user_gal_e2", handle: castId<Handle>("gal-e2") });
  const assetId = await seedAsset(db, ownerId, "asset_gal_e");
  await db.insert(galleryItems).values({ id: castId<GalleryItemId>("gallery_item_gal_e"), assetId });

  // The gallery row carries no ownerId; the owner is reachable via assetId → assets.ownerId only.
  const [row] = await db
    .select({ derivedOwner: assets.ownerId })
    .from(galleryItems)
    .innerJoin(assets, eq(galleryItems.assetId, assets.id))
    .where(eq(galleryItems.assetId, assetId));
  expect(row?.derivedOwner).toBe(ownerId);
  expect(row?.derivedOwner).not.toBe(otherOwner);
});
