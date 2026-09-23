// Integration: cooccurrence compute — keyword×keyword pairs + per-character keyword profiles over an
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
import { expect, test } from "../../../../support/fixtures.ts";
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

  // The pass reads the SAME memory-digest plane compute-themes does, so it owes the same refusal signal
  // (issue #558): with no tier-0 digests every counter is legitimately zero, and the caller must be able to
  // tell "the input does not exist yet" from "nothing changed". `digestsRead` is that discriminator.
  test("NO DIGESTS: reports digestsRead 0 — the caller's refusal signal, not a zero-change run", async () => {
    const db = await freshDb();
    await seedUser(db, "user_a");
    const stats = await svcFor(db).computeCooccurrence({ hubFraction: 1 });
    expect(stats).toMatchObject({ ownersProcessed: 0, pairsWritten: 0, charKeywordsWritten: 0, digestsRead: 0 });
  });

  test("digestsRead counts the tier-0 rows the pass actually read", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    await seedChatDigest(db, {
      id: "d1",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 0,
      contentHash: "h1",
      keywords: ["dragons", "castle"],
    });
    await seedChatDigest(db, {
      id: "d2",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 1,
      contentHash: "h2",
      keywords: ["dragons", "knights"],
    });
    const stats = await svcFor(db).computeCooccurrence({ hubFraction: 1 });
    expect(stats.digestsRead).toBe(2);
  });
});

// #1467 item 2: a GROUP room's digest is scoped to the synthetic per-room bucket, not to a character who was
// in the scene. Tallying it credited a whole room's vocabulary to one synthetic "character" — the theme pass
// already drops these rows before clustering, and this is the same drop in the sibling pass.
describe("group-room digests", () => {
  test("a group-room keyword never lands in character_keyword_profiles, and the pass says so", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    await seedChatDigest(db, {
      id: "digest_solo",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 0,
      contentHash: "h_solo",
      keywords: ["duel", "moonlight"],
    });
    // The group digest keeps the harness default scopedCharacterId — the synthetic group bucket.
    await seedChatDigest(db, {
      id: "digest_group",
      chatId: chat,
      embedding: vec(1),
      tier: 0,
      blockIdx: 1,
      isGroup: true,
      contentHash: "h_group",
      keywords: ["tavern", "brawl"],
    });

    const stats = await svcFor(db).computeCooccurrence({ hubFraction: 1 });

    // Both digests were READ; only the solo one is the pass's actual input plane.
    expect(stats.digestsRead).toBe(2);
    expect(stats.soloDigestsRead).toBe(1);
    const profiles = await db.select({ keyword: characterKeywordProfiles.keyword }).from(characterKeywordProfiles);
    expect(new Set(profiles.map((r) => r.keyword))).toEqual(new Set(["duel", "moonlight"]));
    expect(await pairsFor(db, owner)).toEqual([{ a: "duel", b: "moonlight", count: 1 }]);
  });

  test("a GROUP-ROOMS-ONLY corpus reads digests and writes nothing — its own refusal signal", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedChatDigest(db, {
      id: "digest_group",
      chatId: chat,
      embedding: vec(1),
      tier: 0,
      isGroup: true,
      contentHash: "h_g",
      keywords: ["tavern", "brawl"],
    });

    const stats = await svcFor(db).computeCooccurrence({ hubFraction: 1 });

    expect(stats).toMatchObject({ digestsRead: 1, soloDigestsRead: 0, pairsWritten: 0, charKeywordsWritten: 0 });
  });
});

// #1467 item 4: the tally is built from an unordered SELECT through two Maps, so a count-only comparator left
// the `maxPairs` cut to insertion order — two runs over an UNCHANGED corpus could keep different pairs.
//
// HONEST LABEL: a FENCE, not a defect proof. The pre-fix code passes this fixture, because the row order this
// db happens to return already puts the lexicographic winner first — which is exactly the point: the ORDER IS
// NOT OURS TO PREDICT, and the pin is that the answer does not depend on it. What is proved is the comparator
// contract (equal counts resolve on the pair), so a future edit that drops the tie-break goes red here.
describe("the maxPairs cut is a TOTAL order", () => {
  test("equal counts break on the keyword pair, not on tally insertion order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    // Seeded (and therefore tallied) z-pair FIRST: under a count-only sort it survives a maxPairs of 1.
    await seedChatDigest(db, {
      id: "digest_z",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 0,
      contentHash: "h_z",
      keywords: ["zebra", "zulu"],
    });
    await seedChatDigest(db, {
      id: "digest_a",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 1,
      contentHash: "h_a",
      keywords: ["alpha", "beta"],
    });

    const stats = await svcFor(db).computeCooccurrence({ hubFraction: 1, maxPairs: 1 });

    expect(stats.pairsWritten).toBe(1);
    expect(await pairsFor(db, owner)).toEqual([{ a: "alpha", b: "beta", count: 1 }]);
  });
});
