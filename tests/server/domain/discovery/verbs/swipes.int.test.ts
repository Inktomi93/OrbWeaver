// Integration: PD-40 swipeHotspots — one chat's assistant slots with >1 variant (the re-rolled spots), most
// takes first, with the SELECTED variant's content snippet. Owner-belted via characters.ownerId (a foreign
// chat reads zero rows — no leak). Only slots with >1 variant count; single-take slots are excluded.

import type { Db } from "@orb/db";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeDiscoveryHarness,
  seedCharacter,
  seedHostedChat,
  seedMessage,
  seedMessageVariant,
  seedUser,
} from "../_support.ts";

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("swipeHotspots", () => {
  test("ranks the most-re-rolled slots, only counting >1-variant messages", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const hero = await seedCharacter(db, {
      id: "character_hero",
      ownerId: owner,
      name: "Hero",
    });
    const chat = await seedHostedChat(db, "chat_1", owner);

    // m1: 3 takes (1 selected + 2 extra) — the top hotspot.
    await seedMessage(db, {
      id: "m1",
      chatId: chat,
      seq: 1,
      createdAt: FROZEN_AT,
      characterId: hero,
      variant: { content: "The chosen take for m1." },
    });
    await seedMessageVariant(db, { id: "m1_v1", messageId: "m1", idx: 1, content: "alt a" });
    await seedMessageVariant(db, { id: "m1_v2", messageId: "m1", idx: 2, content: "alt b" });

    // m2: 2 takes — a hotspot, ranked below m1.
    await seedMessage(db, {
      id: "m2",
      chatId: chat,
      seq: 2,
      createdAt: FROZEN_AT,
      characterId: hero,
      variant: { content: "The chosen take for m2." },
    });
    await seedMessageVariant(db, { id: "m2_v1", messageId: "m2", idx: 1, content: "alt c" });

    // m3: a single take — NOT a hotspot (variantCount == 1, excluded by HAVING > 1).
    await seedMessage(db, {
      id: "m3",
      chatId: chat,
      seq: 3,
      createdAt: FROZEN_AT,
      characterId: hero,
      variant: { content: "The only take for m3." },
    });

    const hotspots = await svcFor(db).swipeHotspots(owner, chat);
    expect(hotspots.map((h) => h.messageId)).toEqual([
      expect.stringContaining("m1"),
      expect.stringContaining("m2"),
    ]);
    expect(hotspots[0]?.variantCount).toBe(3);
    expect(hotspots[0]?.snippet).toBe("The chosen take for m1.");
    expect(hotspots[0]?.characterName).toBe("Hero");
    expect(hotspots[0]?.seq).toBe(1);
    expect(hotspots[1]?.variantCount).toBe(2);
  });

  test("respects the limit", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    const chat = await seedHostedChat(db, "chat_1", owner);
    const seedHotspot = async (n: number): Promise<void> => {
      await seedMessage(db, {
        id: `m${n}`,
        chatId: chat,
        seq: n,
        createdAt: FROZEN_AT,
        characterId: hero,
        variant: { content: `take ${n}` },
      });
      await seedMessageVariant(db, { id: `m${n}_v1`, messageId: `m${n}`, idx: 1, content: "alt" });
    };
    await Promise.all([seedHotspot(1), seedHotspot(2), seedHotspot(3)]);
    expect(await svcFor(db).swipeHotspots(owner, chat, 2)).toHaveLength(2);
  });

  test("a foreign owner reads no hotspots from another owner's chat (owner belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const stranger = await seedUser(db, "user_b");
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedMessage(db, {
      id: "m1",
      chatId: chat,
      seq: 1,
      createdAt: FROZEN_AT,
      characterId: hero,
      variant: { content: "owned take" },
    });
    await seedMessageVariant(db, { id: "m1_v1", messageId: "m1", idx: 1, content: "alt" });

    // The stranger passing owner A's chatId reads zero rows — the belt joins characters.ownerId = stranger.
    expect(await svcFor(db).swipeHotspots(stranger, chat)).toEqual([]);
    // Sanity: the owner DOES see it (the belt has teeth).
    expect(await svcFor(db).swipeHotspots(owner, chat)).toHaveLength(1);
  });
});
