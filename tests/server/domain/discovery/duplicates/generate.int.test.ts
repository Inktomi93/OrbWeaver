// Integration: the near-duplicate CHARACTER pass — detection at the cosine threshold, CSLS ranking, owner +
// space scoping, synthetic exclusion, canonical A<B, and the content-hash collapse invariant (esoteric #3).

import type { Db } from "@orb/db";
import { chats, duplicateCharacterPairs, duplicateChatPairs } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDiscoveryHarness, seedCharacter, seedCharacterEmbedding, seedChatSegment, seedHostedChat, seedUser, vec } from "../_support.ts";

describe("computeDuplicatePairs", () => {
  test("records a near-duplicate pair above the cosine threshold, canonical A<B", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    // cos(vec(1,0), vec(1,0.05)) ≈ 0.9988 ≥ 0.92; distinct content hashes ⇒ no collapse.
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0.05),
      contentHash: "h2",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    const stats = await svc.computeDuplicatePairs();
    expect(stats).toMatchObject({ ownersProcessed: 1, charactersScanned: 2, pairsWritten: 1 });

    const rows = await db.select().from(duplicateCharacterPairs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.characterIdA).toBe("character_1"); // A < B (string order)
    expect(rows[0]?.characterIdB).toBe("character_2");
    expect(rows[0]?.similarity ?? 0).toBeGreaterThan(0.92);
  });

  test("does NOT pair characters below the threshold", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    // cos(vec(1,0), vec(0.7,0.7)) ≈ 0.707 < 0.92.
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(0.7, 0.7),
      contentHash: "h2",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  test("never pairs across owners", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const ca = await seedCharacter(db, { id: "character_a", ownerId: a });
    const cb = await seedCharacter(db, { id: "character_b", ownerId: b });
    await seedCharacterEmbedding(db, { characterId: ca, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, { characterId: cb, embedding: vec(1, 0), contentHash: "h2" });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  test("never pairs across embedding spaces", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    await seedCharacterEmbedding(db, {
      characterId: c1,
      embedding: vec(1, 0),
      contentHash: "h1",
      model: "space-one",
    });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0),
      contentHash: "h2",
      model: "space-two",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  test("excludes synthetic characters from pairing (esoteric #12)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    const synth = await seedCharacter(db, { id: "character_s", ownerId: owner, synthetic: true });
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0.05),
      contentHash: "h2",
    });
    await seedCharacterEmbedding(db, {
      characterId: synth,
      embedding: vec(1, 0),
      contentHash: "h3",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();
    const rows = await db.select().from(duplicateCharacterPairs);
    const ids = rows.flatMap((r) => [r.characterIdA, r.characterIdB]);
    expect(ids).not.toContain(synth);
  });

  test("content-hash collapse: byte-identical copies do not inflate into pairs (esoteric #3)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // Three byte-identical copies (SAME contentHash) ⇒ collapse to one rep ⇒ no pairs among them.
    const ids = await Promise.all([1, 2, 3].map((n) => seedCharacter(db, { id: `character_${n}`, ownerId: owner })));
    await Promise.all(ids.map((c) => seedCharacterEmbedding(db, { characterId: c, embedding: vec(1, 0), contentHash: "same" })));
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  // The SINGULAR-mode security invariant: a per-owner recompute reads + REPLACES only that owner's pairs (the
  // delete is scoped by `characterIdA IN that owner's characters`) — it must NEVER wipe another owner's pairs.
  test("a SINGULAR (owner-scoped) recompute leaves ANOTHER owner's pairs untouched", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const a1 = await seedCharacter(db, { id: "character_a1", ownerId: a });
    const a2 = await seedCharacter(db, { id: "character_a2", ownerId: a });
    const b1 = await seedCharacter(db, { id: "character_b1", ownerId: b });
    const b2 = await seedCharacter(db, { id: "character_b2", ownerId: b });
    await seedCharacterEmbedding(db, { characterId: a1, embedding: vec(1, 0), contentHash: "ha1" });
    await seedCharacterEmbedding(db, {
      characterId: a2,
      embedding: vec(1, 0.05),
      contentHash: "ha2",
    });
    await seedCharacterEmbedding(db, { characterId: b1, embedding: vec(0, 1), contentHash: "hb1" });
    await seedCharacterEmbedding(db, {
      characterId: b2,
      embedding: vec(0.05, 1),
      contentHash: "hb2",
    });
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);

    // A global (bulk) recompute records BOTH owners' pairs.
    await svc.computeDuplicatePairs();
    expect(await db.select().from(duplicateCharacterPairs)).toHaveLength(2);

    // Recompute ONLY owner A (singular) — B's pair must survive.
    const stats = await svc.computeDuplicatePairs({ ownerId: a });
    expect(stats.ownersProcessed).toBe(1);
    const bPairs = await db.select().from(duplicateCharacterPairs).where(eq(duplicateCharacterPairs.characterIdA, b1));
    expect(bPairs).toHaveLength(1); // NOT wiped by A's singular run
    expect(await db.select().from(duplicateCharacterPairs)).toHaveLength(2); // both still present
  });

  test("a deleted character removes its pairs by CASCADE (D24 — no sweep)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0.05),
      contentHash: "h2",
    });
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();
    expect(await db.select().from(duplicateCharacterPairs)).toHaveLength(1);

    const { characters } = await import("@orb/db");
    await db.delete(characters).where(eq(characters.id, c1));
    expect(await db.select().from(duplicateCharacterPairs)).toHaveLength(0);
  });
});

// ── the chat near-dup arm (Jaccard of segment content-hashes + fork relation) ──
// Seed a hosted chat with a set of segment content-hashes (distinct blockIdx per segment).
async function seedChatWithHashes(db: Db, id: string, ownerId: UserId, hashes: readonly string[]): Promise<ChatId> {
  const chatId = await seedHostedChat(db, id, ownerId);
  await Promise.all(
    hashes.map((h, i) =>
      seedChatSegment(db, {
        id: `segment_${id}_${i}`,
        chatId,
        embedding: vec(1),
        blockIdx: i,
        contentHash: h,
      }),
    ),
  );
  return chatId;
}

describe("computeChatDuplicatePairs", () => {
  test("pairs chats above the Jaccard threshold, labelled duplicate (no shared fork root)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // A: {h1,h2,h3}, B: {h1,h2,h4} → ∩=2, ∪=4 → Jaccard 0.5 ≥ 0.5. Independent roots → duplicate.
    await seedChatWithHashes(db, "chat_a", owner, ["h1", "h2", "h3"]);
    await seedChatWithHashes(db, "chat_b", owner, ["h1", "h2", "h4"]);

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    const stats = await svc.computeChatDuplicatePairs();
    expect(stats).toMatchObject({ ownersProcessed: 1, chatsScanned: 2, pairsWritten: 1 });

    const rows = await db.select().from(duplicateChatPairs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chatIdA).toBe("chat_a"); // A < B
    expect(rows[0]?.relation).toBe("duplicate");
    expect(rows[0]?.similarity).toBeCloseTo(0.5);
  });

  test("labels a shared-fork-root family `forked`", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedChatWithHashes(db, "chat_a", owner, ["h1", "h2", "h3"]);
    await seedChatWithHashes(db, "chat_b", owner, ["h1", "h2", "h3"]);
    // chat_b is a fork of chat_a → shared root → forked.
    await db
      .update(chats)
      .set({ parentChatId: a })
      .where(eq(chats.id, "chat_b" as ChatId));

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeChatDuplicatePairs();
    const rows = await db.select().from(duplicateChatPairs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.relation).toBe("forked");
    expect(rows[0]?.similarity).toBeCloseTo(1); // identical hash sets
  });

  test("does NOT pair chats below the Jaccard threshold + never across owners", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    // A:{h1,h2,h3,h4} B:{h1,h5,h6,h7} → ∩=1 ∪=7 → 0.14 < 0.5.
    await seedChatWithHashes(db, "chat_a", owner, ["h1", "h2", "h3", "h4"]);
    await seedChatWithHashes(db, "chat_b", owner, ["h1", "h5", "h6", "h7"]);
    // Another owner's identical-looking chats must never pair with A/B.
    await seedChatWithHashes(db, "chat_c", other, ["h1", "h2", "h3"]);

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    const stats = await svc.computeChatDuplicatePairs();
    expect(stats.pairsWritten).toBe(0);
  });
});
