import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// verb: findSyntheticGroupCharacter — look up the room's synthetic bucket; null before it's minted.

import { createCharacterService } from "@orb/server/domain/character";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { makeHarness, seedUser } from "../_support.ts";

describe("find synthetic group character", () => {
  test("returns null before mint, the ref after", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    expect(await svc.findSyntheticGroupCharacter({ ownerId: owner, chatId: castId<ChatId>("chat_1") })).toBeNull();

    const minted = await svc.mintSyntheticGroupCharacter({
      ownerId: owner,
      chatId: castId<ChatId>("chat_1"),
    });
    const found = await svc.findSyntheticGroupCharacter({
      ownerId: owner,
      chatId: castId<ChatId>("chat_1"),
    });
    expect(found?.characterId).toBe(minted.characterId);
  });
});
