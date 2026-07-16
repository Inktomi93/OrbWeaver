// persistence: digest-rows — the raw digest/segment vector scans (the digest/segment analogues of
// nearest.ts; the `vector_distance_cos` sites). Asserts ascending-by-distance ordering, the SPACE belt
// (a different-`model` row never returned), the cross-chat OWNER belt (derived via the producer card — a
// foreign owner's digest is never returned), the within-chat belt, and the candidate restriction.

import { describe } from "vitest";
import { nearestDigests, nearestSegments } from "../../../../../packages/server/src/domain/search/persistence/digest-rows.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { EMBED_MODEL, seedCharacter, seedChat, seedChatDigest, seedChatSegment, seedUser, vec } from "../_support.ts";

describe("nearestDigests", () => {
  test("returns within-chat digests ascending by distance", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const char = await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
    const chat = await seedChat(db, "chat_a");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 1,
      embedding: vec(0, 1),
    });

    const rows = await nearestDigests(db, {
      queryVector: vec(1),
      model: EMBED_MODEL,
      chatIds: [chat],
      limit: 10,
    });

    expect(rows.map((r) => r.blockIdx)).toEqual([0, 1]);
    expect(rows[0]?.distance).toBeLessThan(rows[1]?.distance ?? Number.POSITIVE_INFINITY);
  });

  test("the SPACE belt excludes a different-model digest", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const char = await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
    const chat = await seedChat(db, "chat_a");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 1,
      embedding: vec(1),
      model: "other-space",
    });

    const rows = await nearestDigests(db, {
      queryVector: vec(1),
      model: EMBED_MODEL,
      chatIds: [chat],
      limit: 10,
    });

    expect(rows.map((r) => r.blockIdx)).toEqual([0]);
  });

  test("the cross-chat OWNER belt excludes a foreign owner's digest", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    const chatA = await seedChat(db, "chat_a");
    const chatB = await seedChat(db, "chat_b");
    await seedChatDigest(db, {
      chatId: chatA,
      scopedCharacterId: mine,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigest(db, {
      chatId: chatB,
      scopedCharacterId: theirs,
      blockIdx: 0,
      embedding: vec(1),
    });

    const rows = await nearestDigests(db, {
      queryVector: vec(1),
      model: EMBED_MODEL,
      ownerId: owner,
      limit: 10,
    });

    expect(rows.map((r) => r.scopedCharacterId)).toEqual([mine]);
  });
});

describe("nearestSegments", () => {
  test("returns chat-set segments ascending by distance + excludes other-space/other-chat rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
    const chat = await seedChat(db, "chat_a");
    const otherChat = await seedChat(db, "chat_other");
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, embedding: vec(1) });
    await seedChatSegment(db, { chatId: chat, blockIdx: 1, embedding: vec(0, 1) });
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 2,
      embedding: vec(1),
      model: "other-space",
    });
    await seedChatSegment(db, { chatId: otherChat, blockIdx: 0, embedding: vec(1) });

    const rows = await nearestSegments(db, {
      queryVector: vec(1),
      model: EMBED_MODEL,
      chatIds: [chat],
      limit: 10,
    });

    expect(rows.map((r) => r.blockIdx)).toEqual([0, 1]);
  });
});
