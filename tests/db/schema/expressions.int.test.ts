// .int tests for schema/expressions (D49 #4 — the expressions baseline rider). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: character_sprites composite-PK (characterId, label) upsert-replace
// semantics; BOTH FKs CASCADE (character delete wipes bindings; asset delete cannot strand a dangling
// binding); NO ownerId column (D23 — owner derives via characters.ownerId).

import type { Db } from "@orb/db";
import { assets, characterSprites, characters, users } from "@orb/db";
import type { AssetId, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

async function seedOwner(db: Db, id: string, handle: string): Promise<UserId> {
  const ownerId = castId<UserId>(id);
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>(handle) });
  return ownerId;
}

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
    kind: "sprite",
    mime: "image/webp",
    size: 100,
    hash: id.padEnd(64, "0"),
  });
  return assetId;
}

test("character_sprites: composite-PK (characterId,label) upsert REPLACES, never duplicates", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_sp_a", "sp-a");
  const characterId = await seedCharacter(db, ownerId, "character_sp_a");
  const assetA = await seedAsset(db, ownerId, "asset_sp_a1");
  const assetB = await seedAsset(db, ownerId, "asset_sp_a2");
  const now = new Date(1_700_000_000_000);

  await db
    .insert(characterSprites)
    .values({ characterId, label: "joy", assetId: assetA, createdAt: now });
  // Upsert the SAME (characterId, label) → replaces the binding, one row.
  await db
    .insert(characterSprites)
    .values({ characterId, label: "joy", assetId: assetB, createdAt: now })
    .onConflictDoUpdate({
      target: [characterSprites.characterId, characterSprites.label],
      set: { assetId: assetB },
    });

  const rows = await db
    .select()
    .from(characterSprites)
    .where(eq(characterSprites.characterId, characterId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.assetId).toBe(assetB);
});

test("character delete CASCADEs its sprite bindings", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_sp_c", "sp-c");
  const characterId = await seedCharacter(db, ownerId, "character_sp_c");
  const assetId = await seedAsset(db, ownerId, "asset_sp_c");
  await db
    .insert(characterSprites)
    .values({ characterId, label: "anger", assetId, createdAt: new Date(1_700_000_000_000) });

  await db.delete(characters).where(eq(characters.id, characterId));
  expect(
    await db.select().from(characterSprites).where(eq(characterSprites.characterId, characterId)),
  ).toHaveLength(0);
});

test("asset delete CASCADEs the binding (never a dangling sprite row)", async () => {
  const db = await freshDb();
  const ownerId = await seedOwner(db, "user_sp_d", "sp-d");
  const characterId = await seedCharacter(db, ownerId, "character_sp_d");
  const assetId = await seedAsset(db, ownerId, "asset_sp_d");
  await db
    .insert(characterSprites)
    .values({ characterId, label: "fear", assetId, createdAt: new Date(1_700_000_000_000) });

  await db.delete(assets).where(eq(assets.id, assetId));
  expect(
    await db
      .select()
      .from(characterSprites)
      .where(
        and(eq(characterSprites.characterId, characterId), eq(characterSprites.label, "fear")),
      ),
  ).toHaveLength(0);
});
