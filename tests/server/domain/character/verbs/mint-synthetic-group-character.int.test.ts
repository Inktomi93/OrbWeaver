import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// verb: mintSyntheticGroupCharacter — find-or-mint the hidden `__group__<chatId>` identity. Load-bearing:
// owner-stamped (never NULL author), synthetic=true, IDEMPOTENT (a second mint returns the same row), and
// no character.updated emit (synthetic rows aren't embedded).

import { characters } from "@orb/db";
import { CharacterOperationError, createCharacterService } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, seedRawCharacter, seedUser } from "../_support.ts";

describe("mintSyntheticGroupCharacter", () => {
  test("mints an owner-stamped synthetic character with the group handle; no emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const ref = await svc.mintSyntheticGroupCharacter({
      ownerId: owner,
      chatId: castId<ChatId>("chat_1"),
    });

    const rows = await db.select().from(characters).where(eq(characters.id, ref.characterId));
    const row = rows[0];
    expect(row?.handle).toBe("__group__chat_1");
    expect(row?.ownerId).toBe(owner);
    expect(row?.synthetic).toBe(true);
    expect(row?.ownerId).not.toBeNull();
    expect(h.events).toEqual([]);
  });

  test("is idempotent — a second mint returns the same id", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const first = await svc.mintSyntheticGroupCharacter({
      ownerId: owner,
      chatId: castId<ChatId>("chat_1"),
    });
    const second = await svc.mintSyntheticGroupCharacter({
      ownerId: owner,
      chatId: castId<ChatId>("chat_1"),
    });
    expect(second.characterId).toBe(first.characterId);
    const all = await db.select().from(characters);
    expect(all).toHaveLength(1);
  });

  test("refuses to adopt a NON-synthetic row squatting the reserved handle (never authors under a real card)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    // A raw non-synthetic card occupying the group handle (the create wire now refuses this — seed it directly).
    await seedRawCharacter(db, {
      id: "character_squat",
      ownerId: owner,
      handle: "__group__chat_1",
      synthetic: false,
    });

    await expect(
      svc.mintSyntheticGroupCharacter({ ownerId: owner, chatId: castId<ChatId>("chat_1") }),
    ).rejects.toBeInstanceOf(CharacterOperationError);
  });

  test("different rooms mint distinct buckets", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const a = await svc.mintSyntheticGroupCharacter({
      ownerId: owner,
      chatId: castId<ChatId>("chat_1"),
    });
    const b = await svc.mintSyntheticGroupCharacter({
      ownerId: owner,
      chatId: castId<ChatId>("chat_2"),
    });
    expect(a.characterId).not.toBe(b.characterId);
  });
});
