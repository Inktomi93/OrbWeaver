// Integration: the owner-scoped near-duplicate CHARACTER read — name enrichment, CSLS ranking, owner
// isolation (audit #1), and the minScore/limit options.

import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  makeDiscoveryHarness,
  seedCharacter,
  seedCharacterEmbedding,
  seedChatSegment,
  seedHostedChat,
  seedUser,
  vec,
} from "../_support.ts";

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
