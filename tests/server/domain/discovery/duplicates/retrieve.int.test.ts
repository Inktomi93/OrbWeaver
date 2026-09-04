// Integration: the owner-scoped near-duplicate CHARACTER read — name enrichment, CSLS ranking, owner
// isolation (audit #1), and the minScore/limit options.

import type { Db } from "@orb/db";
import { chats, duplicateCharacterPairs, duplicateChatPairs } from "@orb/db";
import type { DuplicateCharacterPairId, DuplicateChatPairId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDiscoveryHarness, seedCharacter, seedCharacterEmbedding, seedChatSegment, seedHostedChat, seedUser, vec } from "../_support.ts";

async function seedNearDupPair(db: Db, ownerId: UserId): Promise<void> {
  const c1 = await seedCharacter(db, { id: "character_1", ownerId, name: "Aria" });
  const c2 = await seedCharacter(db, { id: "character_2", ownerId, name: "Aria Clone" });
  await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
  await seedCharacterEmbedding(db, { characterId: c2, embedding: vec(1, 0.05), contentHash: "h2" });
}

describe("duplicateCharacters", () => {
  test("returns the owner's pairs with both card names", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedNearDupPair(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();

    const pairs = await svc.duplicateCharacters(owner);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ nameA: "Aria", nameB: "Aria Clone" });
    expect(pairs[0]?.similarity ?? 0).toBeGreaterThan(0.92);
  });

  test("a foreign owner sees none of another user's pairs (audit #1)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedNearDupPair(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();

    expect(await svc.duplicateCharacters(other)).toEqual([]);
  });

  test("minScore filters and limit caps", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedNearDupPair(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();

    expect(await svc.duplicateCharacters(owner, { minScore: 99 })).toEqual([]);
    expect(await svc.duplicateCharacters(owner, { limit: 0 })).toEqual([]);
  });
});

async function seedNearDupChats(db: Db, ownerId: UserId): Promise<void> {
  const a = await seedHostedChat(db, "chat_a", ownerId);
  const b = await seedHostedChat(db, "chat_b", ownerId);
  await db.update(chats).set({ title: "Alpha" }).where(eq(chats.id, a));
  await db.update(chats).set({ title: "Beta" }).where(eq(chats.id, b));
  // Identical hash sets → Jaccard 1.
  await Promise.all(
    ["h1", "h2"].flatMap((h, i) => [
      seedChatSegment(db, {
        id: `sa_${i}`,
        chatId: a,
        embedding: vec(1),
        blockIdx: i,
        contentHash: h,
      }),
      seedChatSegment(db, {
        id: `sb_${i}`,
        chatId: b,
        embedding: vec(1),
        blockIdx: i,
        contentHash: h,
      }),
    ]),
  );
}

describe("duplicateChats", () => {
  test("returns the owner's chat pairs with titles + fork relation, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedNearDupChats(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeChatDuplicatePairs();

    const pairs = await svc.duplicateChats(owner);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ titleA: "Alpha", titleB: "Beta", relation: "duplicate" });
    expect(pairs[0]?.similarity).toBeCloseTo(1);

    // A foreign owner sees none (audit #1).
    expect(await svc.duplicateChats(other)).toEqual([]);
  });

  test("relation filter + minScore + limit narrow the result", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedNearDupChats(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeChatDuplicatePairs();

    expect(await svc.duplicateChats(owner, { relation: "forked" })).toEqual([]); // these are `duplicate`
    expect(await svc.duplicateChats(owner, { minScore: 1.01 })).toEqual([]);
    expect(await svc.duplicateChats(owner, { limit: 0 })).toEqual([]);
    expect(await svc.duplicateChats(owner, { relation: "duplicate" })).toHaveLength(1);
  });
});

// ── #1414 seam 2: BOTH SIDES of a pair carry the owner predicate ──────────────────────────────────────
// "A pair is only ever computed inside one owner's library, so filtering A implies B" is a property of the
// WRITER. Neither pair table has an owner column or a same-owner constraint, so nothing below the writer
// held it — the belt was a comment. These rows are written DIRECTLY, standing in for any future writer, a
// repair, or a restore that breaks the invariant; the read must refuse them either way.
describe("#1414 — a cross-owner pair row is refused by the READ, not just by the writer's habits", () => {
  test("SECURITY: duplicateCharacters never surfaces a pair whose side B belongs to another tenant", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const stranger = await seedUser(db, "user_b");
    const mine = await seedCharacter(db, { id: "character_1_mine", ownerId: owner, name: "Aria" });
    const theirs = await seedCharacter(db, { id: "character_2_theirs", ownerId: stranger, name: "Their Secret Card" });

    await db.insert(duplicateCharacterPairs).values({
      id: castId<DuplicateCharacterPairId>("duplicate_character_pair_x"),
      characterIdA: mine,
      characterIdB: theirs,
      cslsScore: 0.99,
      similarity: 0.99,
      model: "test",
      computedAt: 1,
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect(await svc.duplicateCharacters(owner)).toEqual([]);
  });

  test("SECURITY: duplicateChats never surfaces a pair whose side B is hosted by another tenant", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const stranger = await seedUser(db, "user_b");
    const mine = await seedHostedChat(db, "chat_1_mine", owner);
    const theirs = await seedHostedChat(db, "chat_2_theirs", stranger);
    await db.update(chats).set({ title: "Their Private Room" }).where(eq(chats.id, theirs));

    await db.insert(duplicateChatPairs).values({
      id: castId<DuplicateChatPairId>("duplicate_chat_pair_x"),
      chatIdA: mine,
      chatIdB: theirs,
      cslsScore: 1,
      similarity: 1,
      relation: "duplicate",
      model: "test",
      computedAt: 1,
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect(await svc.duplicateChats(owner)).toEqual([]);
  });
});
