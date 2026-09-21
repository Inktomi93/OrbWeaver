// imagery.int — schema/imagery (imagery_generations) against a real libSQL :memory: db (FK PRAGMA ON).
// Covers: round-trip + defaults (edited=false, createdAt born); the mode CHECK (derives PROMPT_TEMPLATE_MODES);
// assetId CASCADE (deleting the depicted asset erases its provenance row); chatId SET NULL (the generation
// outlives a deleted chat); subjectCharacterId SET NULL (the depicted character can be deleted independently).

import { PROMPT_TEMPLATE_MODES } from "@orb/contracts/imagery";
import type { Db } from "@orb/db";
import { assets, characters, chats, imageryGenerations } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { AssetId, CharacterHandle, CharacterId, ImageryGenerationId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";
import { testModelId } from "../../support/inference-identities.ts";
import { seedChat, seedUser } from "./_support.ts";

function isConstraintErr(err: unknown): boolean {
  return isConstraintViolation(err) !== undefined;
}

async function seedAsset(db: Db, ownerId: UserId, id: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "generated", mime: "image/png", size: 10, hash: `hash-${id}` });
  return assetId;
}

test("mode enum mirrors PROMPT_TEMPLATE_MODES (derives the tuple, never re-spells)", () => {
  expect(imageryGenerations.mode.enumValues).toEqual([...PROMPT_TEMPLATE_MODES]);
});

test("round-trips, borns createdAt, and defaults edited=false", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_img_a" });
  const assetId = await seedAsset(db, ownerId, "asset_img_a");
  const id = castId<ImageryGenerationId>("imagery_generation_a");

  await db.insert(imageryGenerations).values({
    id,
    assetId,
    mode: "free",
    prompt: "a cat on a windowsill",
    model: testModelId("sdxl"),
  });

  const rows = await db.select().from(imageryGenerations).where(eq(imageryGenerations.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.edited).toBe(false);
  expect(rows[0]?.createdAt).toBeGreaterThan(0);
  expect(rows[0]?.chatId).toBeNull();
  expect(rows[0]?.subjectCharacterId).toBeNull();

  // The mode CHECK rejects a value outside the canonical tuple.
  await expect(
    db.insert(imageryGenerations).values({
      id: castId<ImageryGenerationId>("imagery_generation_bad"),
      assetId,
      mode: "bogus" as "free",
      prompt: "x",
      model: testModelId("sdxl"),
    }),
  ).rejects.toSatisfy(isConstraintErr);
});

test("assetId CASCADE erases the provenance row; chatId + subjectCharacterId SET NULL independently", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_img_b" });
  const chatId = await seedChat(db, { id: "chat_img_b" });
  const characterId = castId<CharacterId>("character_img_b");
  await db.insert(characters).values({ id: characterId, handle: castId<CharacterHandle>("card-img-b"), ownerId, contentHash: "h", name: "C" });
  const assetId = await seedAsset(db, ownerId, "asset_img_b");
  const id = castId<ImageryGenerationId>("imagery_generation_b");

  await db.insert(imageryGenerations).values({
    id,
    assetId,
    chatId,
    subjectCharacterId: characterId,
    mode: "character",
    prompt: "a portrait",
    model: testModelId("sdxl"),
  });

  // Chat delete → SET NULL, the generation survives.
  await db.delete(chats).where(eq(chats.id, chatId));
  const afterChat = await db.select().from(imageryGenerations).where(eq(imageryGenerations.id, id));
  expect(afterChat[0]?.chatId).toBeNull();

  // Character delete → SET NULL, the generation survives.
  await db.delete(characters).where(eq(characters.id, characterId));
  const afterCharacter = await db.select().from(imageryGenerations).where(eq(imageryGenerations.id, id));
  expect(afterCharacter[0]?.subjectCharacterId).toBeNull();

  // Asset delete → the provenance row CASCADEs away.
  await db.delete(assets).where(eq(assets.id, assetId));
  expect(await db.select().from(imageryGenerations).where(eq(imageryGenerations.id, id))).toHaveLength(0);
});
