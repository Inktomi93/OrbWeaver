// Integration: PD-40 cooccurrence compute — keyword×keyword pairs + per-character keyword profiles over an
// owner's tier-0 digest keywords. Proofs:
//   • unordered pairs (canonical A<B) tally once per digest; profiles credit the witnessing character.
//   • hub-token filter — a keyword present in > hubFraction of the owner's digests is dropped.
//   • content-collapse — a forked scene (same content_hash) counts once.
//   • owner isolation (audit #1) — a foreign owner's digests never mix into the tally.
//   • tier-0 only — a tier-1 synthesis digest is ignored.

import type { Db } from "@orb/db";
import { characterKeywordProfiles, keywordCooccurrence } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDiscoveryHarness, seedCharacter, seedChatDigest, seedHostedChat, seedUser, vec } from "../_support.ts";

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

async function pairsFor(db: Db, ownerId: UserId): Promise<{ a: string; b: string; count: number }[]> {
  const rows = await db
    .select({
      a: keywordCooccurrence.keywordA,
      b: keywordCooccurrence.keywordB,
      count: keywordCooccurrence.count,
    })
    .from(keywordCooccurrence)
    .where(eq(keywordCooccurrence.ownerId, ownerId));
  return rows.sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1));
}

describe("computeCooccurrence", () => {
  test("tallies unordered keyword pairs + per-character profiles (hub filter off)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    await seedChatDigest(db, {
      id: "digest_1",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 0,
      contentHash: "h1",
      keywords: ["dragons", "castle", "knights"],
    });
    await seedChatDigest(db, {
      id: "digest_2",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 1,
      contentHash: "h2",
      keywords: ["dragons", "castle"],
    });

    // hubFraction: 1 disables dropping (no keyword appears in > 2 digests).
    const stats = await svcFor(db).computeCooccurrence({ hubFraction: 1 });
    expect(stats.ownersProcessed).toBe(1);
    expect(stats.hubTokensDropped).toBe(0);

    const pairs = await pairsFor(db, owner);
    // castle<dragons<knights → (castle,dragons)=2, (castle,knights)=1, (dragons,knights)=1.
    expect(pairs).toEqual([
      { a: "castle", b: "dragons", count: 2 },
      { a: "castle", b: "knights", count: 1 },
      { a: "dragons", b: "knights", count: 1 },
    ]);

    const profiles = await db
      .select({ keyword: characterKeywordProfiles.keyword, count: characterKeywordProfiles.count })
      .from(characterKeywordProfiles)
      .where(eq(characterKeywordProfiles.characterId, hero));
    const byKw = Object.fromEntries(profiles.map((p) => [p.keyword, p.count]));
    expect(byKw).toEqual({ castle: 2, dragons: 2, knights: 1 });
  });

  test("drops hub tokens present in > hubFraction of the owner's digests", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    // "common" in all 3 digests (> 0.5·3 = 1.5) → a hub token, dropped from pairs.
    await seedChatDigest(db, {
      id: "d1",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 2,
      contentHash: "h1",
      keywords: ["common", "sword"],
    });
    await seedChatDigest(db, {
      id: "d2",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 3,
      contentHash: "h2",
      keywords: ["common", "shield"],
    });
    await seedChatDigest(db, {
      id: "d3",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 4,
      contentHash: "h3",
      keywords: ["common", "armor"],
    });

    const stats = await svcFor(db).computeCooccurrence();
    expect(stats.hubTokensDropped).toBe(1);
    const pairs = await pairsFor(db, owner);
    // "common" is dropped, so no pair survives (each digest has one non-hub keyword).
    expect(pairs.some((p) => p.a === "common" || p.b === "common")).toBe(false);
  });

  test("a forked scene (same content_hash) counts once", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    await seedChatDigest(db, {
      id: "orig",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 5,
      contentHash: "same",
      keywords: ["dragons", "castle"],
    });
    await seedChatDigest(db, {
      id: "fork",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 6,
      contentHash: "same",
      keywords: ["dragons", "castle"],
    });

    await svcFor(db).computeCooccurrence({ hubFraction: 1 });
    const pairs = await pairsFor(db, owner);
    // Collapsed to ONE scene → the pair counts once, not twice.
    expect(pairs).toEqual([{ a: "castle", b: "dragons", count: 1 }]);
  });

  test("owner isolation + tier-0 only", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const otherChat = await seedHostedChat(db, "chat_2", other);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    const rival = await seedCharacter(db, { id: "character_rival", ownerId: other, name: "Rival" });
    // A tier-1 synthesis (must be ignored).
    await seedChatDigest(db, {
      id: "arc",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 1,
      blockIdx: 7,
      contentHash: "arc_h",
      keywords: ["dragons", "castle"],
    });
    // Another owner's tier-0 (must not mix in).
    await seedChatDigest(db, {
      id: "foreign",
      chatId: otherChat,
      embedding: vec(1),
      scopedCharacterId: rival,
      tier: 0,
      blockIdx: 8,
      contentHash: "f_h",
      keywords: ["pirates", "treasure"],
    });

    await svcFor(db).computeCooccurrence({ hubFraction: 1 });
    expect(await pairsFor(db, owner)).toEqual([]); // only a tier-1 digest → nothing
    expect((await pairsFor(db, other)).map((p) => `${p.a}-${p.b}`)).toEqual(["pirates-treasure"]);
  });
});
