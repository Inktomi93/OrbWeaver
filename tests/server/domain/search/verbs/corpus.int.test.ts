// verb: corpus — cross-chat hybrid retrieval. Asserts owner-wide scope (derived via the producer card, no
// chat_participants), the joint digest+segment scan, block-level dedupe (a digest + its segment of the same
// block collapse to ONE — the better-ranked lens wins under mixC), content-hash collapse (fork/import copies
// across chats collapse to one representative), and the empty-pool short-circuit.

import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import {
  makeSearch,
  seedCharacter,
  seedChat,
  seedChatDigest,
  seedChatSegment,
  seedUser,
  vec,
} from "../_support.ts";

describe("corpus", () => {
  test("dedupes a block present in BOTH lenses to one hit (mixB keeps the digest)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const char = await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
    const chat = await seedChat(db, "chat_a");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
      text: "DIGEST",
    });
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, embedding: vec(1), text: "SEGMENT" });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.corpus({ ownerId: owner, queryText: "q", mode: "mixB", minScore: 0 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.text).toBe("DIGEST");
    expect(hits[0]?.blockKey).toEqual({
      chatId: chat,
      tier: 0,
      blockIdx: 0,
      scopedCharacterId: char,
    });
  });

  test("a mixC rerank that prefers the segment makes the verbatim lens win the block", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const char = await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
    const chat = await seedChat(db, "chat_a");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
      text: "DIGEST",
    });
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, embedding: vec(1), text: "SEGMENT" });

    // Rank the segment candidate (id prefixed "s|") first.
    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: (_q, documents) => {
        const ordered = [...documents].sort(
          (a, b) => (a.id.startsWith("s|") ? -1 : 1) - (b.id.startsWith("s|") ? -1 : 1),
        );
        return Promise.resolve({
          hits: ordered.map((d, i) => ({ id: d.id, score: ordered.length - i })),
          model: "rerank",
          usage: { totalTokens: null },
        });
      },
    });

    const hits = await svc.corpus({ ownerId: owner, queryText: "q", mode: "mixC", minScore: 0 });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.text).toBe("SEGMENT");
  });

  test("collapses fork/import copies (identical contentHash across chats) to one", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const char = await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
    const chatA = await seedChat(db, "chat_a");
    const chatB = await seedChat(db, "chat_b");
    await seedChatDigest(db, {
      chatId: chatA,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
      contentHash: "shared_hash",
    });
    await seedChatDigest(db, {
      chatId: chatB,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
      contentHash: "shared_hash",
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.corpus({ ownerId: owner, queryText: "q", mode: "mixB", minScore: 0 });

    expect(hits).toHaveLength(1);
  });

  test("owner-derived scope excludes another owner's blocks", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    const chatMine = await seedChat(db, "chat_mine");
    const chatTheirs = await seedChat(db, "chat_theirs");
    await seedChatDigest(db, {
      chatId: chatMine,
      scopedCharacterId: mine,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigest(db, {
      chatId: chatTheirs,
      scopedCharacterId: theirs,
      blockIdx: 0,
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.corpus({ ownerId: owner, queryText: "q", mode: "mixB", minScore: 0 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.blockKey.scopedCharacterId).toBe(mine);
  });

  test("an empty digest pool short-circuits to no hits", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const svc = makeSearch(db, { embedVector: () => vec(1) });

    const hits = await svc.corpus({ ownerId: owner, queryText: "q", mode: "mixB", minScore: 0 });
    expect(hits).toEqual([]);
  });
});
