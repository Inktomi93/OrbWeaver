// verb: mintSyntheticGroupCharacter — find-or-mint the hidden `__group__<chatId>` identity. Load-bearing:
// owner-stamped (never NULL author), synthetic=true, IDEMPOTENT (a second mint returns the same row), and
// no character.updated emit (synthetic rows aren't embedded).

import { characters } from "@orb/db";
import { createCharacterService } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, seedUser } from "../_support.ts";

describe("mintSyntheticGroupCharacter", () => {
  test("mints an owner-stamped synthetic character with the group handle; no emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const ref = await svc.mintSyntheticGroupCharacter({ ownerId: owner, chatId: "chat_1" });

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
    const first = await svc.mintSyntheticGroupCharacter({ ownerId: owner, chatId: "chat_1" });
    const second = await svc.mintSyntheticGroupCharacter({ ownerId: owner, chatId: "chat_1" });
    expect(second.characterId).toBe(first.characterId);
    const all = await db.select().from(characters);
    expect(all).toHaveLength(1);
  });

  test("different rooms mint distinct buckets", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const a = await svc.mintSyntheticGroupCharacter({ ownerId: owner, chatId: "chat_1" });
    const b = await svc.mintSyntheticGroupCharacter({ ownerId: owner, chatId: "chat_2" });
    expect(a.characterId).not.toBe(b.characterId);
  });
});
