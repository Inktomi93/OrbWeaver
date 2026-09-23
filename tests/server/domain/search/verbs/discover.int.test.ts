// verb: discover — character discovery by best-segment neighbourhood (the third retrieval lens). See docs/work/0122.
// Asserts against a real db + a scripted role-clients bundle: the owner-wide verbatim scan groups matching
// lived-scene segments by character with evidence; the SCOPED-PRODUCER credit (solo blocks) AND — THE
// LOAD-BEARING CASE — the GROUP CO-STAR credit (a group block credits every speaker, not just the egocentric
// producer, and the synthetic group-as-character is never credited); the per-character evidence cap +
// matchCount; owner isolation (the segment scan is bounded to the owner's materialized chats); rerank-before-
// grouping; and the empty-query SearchError.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { SearchError } from "@orb/server/domain/search";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeSearch, seedCharacter, seedChat, seedChatDigest, seedChatDigestSpeaker, seedChatSegment, seedUser, vec } from "../_support.ts";

describe("discover", () => {
  test("credits a solo block to its scoped character with the segment as evidence", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const nyx = await seedCharacter(db, { id: "character_nyx", ownerId: owner, name: "Nyx" });
    const chat = await seedChat(db, "chat_solo");
    // A tier-0 digest keys the block to Nyx (the segment credit path requires it); the segment matches.
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: nyx,
      blockIdx: 0,
      embedding: vec(0, 1),
    });
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 0,
      text: "Nyx drew her blade in the moonlit alley.",
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.discover({ ownerId: owner, queryText: "a duel at night", topN: 5 });

    expect(result).toHaveLength(1);
    expect(result[0]?.characterId).toBe(nyx);
    expect(result[0]?.name).toBe("Nyx");
    expect(result[0]?.matchCount).toBe(1);
    expect(result[0]?.segments).toHaveLength(1);
    expect(result[0]?.segments[0]?.snippet).toContain("moonlit alley");
    expect(result[0]?.segments[0]?.chatId).toBe(chat);
  });

  // #172: a chunked block is N rows. `matchCount` and the evidence list are per SCENE, so the chunks collapse
  // to the block's best one first — counting a long message twice would rank a character on one dump.
  test("a CHUNKED block counts as ONE match, with its best chunk as the evidence", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const nyx = await seedCharacter(db, { id: "character_nyx", ownerId: owner, name: "Nyx" });
    const chat = await seedChat(db, "chat_chunked");
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: nyx, blockIdx: 0, embedding: vec(0, 1) });
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, chunkIdx: 0, text: "Nyx sharpened the blade for hours.", embedding: vec(0, 1) });
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, chunkIdx: 1, text: "Nyx drew her blade in the moonlit alley.", embedding: vec(1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.discover({ ownerId: owner, queryText: "a duel at night", topN: 5 });

    expect(result).toHaveLength(1);
    expect(result[0]?.matchCount).toBe(1); // ONE scene, not two
    expect(result[0]?.segments).toHaveLength(1);
    expect(result[0]?.segments[0]?.snippet).toContain("moonlit alley"); // the chunk that matched
  });

  test("a GROUP block credits every co-star speaker (not the synthetic group char)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const alice = await seedCharacter(db, { id: "character_alice", ownerId: owner, name: "Alice" });
    const bob = await seedCharacter(db, { id: "character_bob", ownerId: owner, name: "Bob" });
    // The hidden group-as-character bucket the digest is scoped under (synthetic — must NOT be credited).
    const group = await seedCharacter(db, {
      id: "character_group",
      ownerId: owner,
      name: "__group__chat_grp",
      synthetic: true,
    });
    const chat = await seedChat(db, "chat_grp");
    const digest = await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: group,
      blockIdx: 0,
      embedding: vec(0, 1),
    });
    // Both Alice and Bob spoke in the block (the co-star join).
    await seedChatDigestSpeaker(db, digest, alice);
    await seedChatDigestSpeaker(db, digest, bob);
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 0,
      text: "Alice and Bob argued about the map.",
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.discover({ ownerId: owner, queryText: "an argument", topN: 5 });

    const credited = new Set(result.map((r) => r.characterId));
    expect(credited).toEqual(new Set([alice, bob]));
    // The synthetic group char is never surfaced.
    expect(credited.has(group)).toBe(false);
    // The one block is evidence for BOTH co-stars.
    expect(result.find((r) => r.characterId === alice)?.segments).toHaveLength(1);
    expect(result.find((r) => r.characterId === bob)?.segments[0]?.snippet).toContain("the map");
  });

  test("caps evidence per character at DISCOVER_SEGMENTS_PER_CHAR but counts every match", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const nyx = await seedCharacter(db, { id: "character_nyx", ownerId: owner, name: "Nyx" });
    const chat = await seedChat(db, "chat_many");
    // Four matching blocks, all credited to Nyx (each with its own tier-0 digest + verbatim segment).
    await Promise.all(
      Array.from({ length: 4 }, async (_unused, i) => {
        await seedChatDigest(db, {
          chatId: chat,
          scopedCharacterId: nyx,
          blockIdx: i,
          embedding: vec(0, 1),
        });
        await seedChatSegment(db, {
          chatId: chat,
          blockIdx: i,
          text: `scene ${i}`,
          embedding: vec(1),
        });
      }),
    );

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.discover({ ownerId: owner, queryText: "scene", topN: 5 });

    expect(result).toHaveLength(1);
    expect(result[0]?.matchCount).toBe(4);
    expect(result[0]?.segments).toHaveLength(3); // DISCOVER_SEGMENTS_PER_CHAR
  });

  test("never surfaces another owner's lived scenes", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    const myChat = await seedChat(db, "chat_mine");
    const theirChat = await seedChat(db, "chat_theirs");
    await seedChatDigest(db, {
      chatId: myChat,
      scopedCharacterId: mine,
      blockIdx: 0,
      embedding: vec(0, 1),
    });
    await seedChatDigest(db, {
      chatId: theirChat,
      scopedCharacterId: theirs,
      blockIdx: 0,
      embedding: vec(0, 1),
    });
    await seedChatSegment(db, { chatId: myChat, blockIdx: 0, text: "my scene", embedding: vec(1) });
    await seedChatSegment(db, {
      chatId: theirChat,
      blockIdx: 0,
      text: "their scene",
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.discover({ ownerId: owner, queryText: "a scene", topN: 10 });

    expect(result.map((r) => r.characterId)).toEqual([mine]);
  });

  test("rerank promotes a segment before grouping", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    const chat = await seedChat(db, "chat_rr");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: a,
      blockIdx: 0,
      embedding: vec(0, 1),
    });
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: b,
      blockIdx: 1,
      embedding: vec(0, 1),
    });
    // A's block is the closer cosine hit; a reversing reranker must flip the character order to [B, A].
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 0,
      text: "scene for A",
      embedding: vec(1),
    });
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 1,
      text: "scene for B",
      embedding: vec(0.9, 0.1),
    });

    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: (_q, documents) =>
        Promise.resolve({
          hits: [...documents].reverse().map((d, i) => ({ id: d.id, score: documents.length - i })),
          model: "rerank",
          usage: { totalTokens: null },
        }),
    });

    const plain = await svc.discover({ ownerId: owner, queryText: "scene", topN: 5 });
    expect(plain.map((r) => r.characterId)).toEqual([a, b]);

    const reranked = await svc.discover({
      ownerId: owner,
      queryText: "scene",
      topN: 5,
      rerank: true,
    });
    expect(reranked.map((r) => r.characterId)).toEqual([b, a]);
  });

  test("a query that embeds to nothing throws a typed SearchError", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const svc = makeSearch(db, { embedVector: () => null });
    await expect(svc.discover({ ownerId: owner, queryText: "anything", topN: 5 })).rejects.toBeInstanceOf(SearchError);
  });
});

// #1467 item 5: `collapseSegmentChunks` is FIRST-WINS, so whatever order it is handed CHOOSES each block's
// representative. Collapsing a raw-distance order threw away the chunk this verb actually ranks by.
describe("chunk collapse follows the CSLS ranking, not raw distance", () => {
  test("keeps the chunk with the better HUB-ADJUSTED score, not the merely closer one", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const nyx = await seedCharacter(db, { id: "character_nyx", ownerId: owner, name: "Nyx" });
    const chat = await seedChat(db, "chat_hub");
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: nyx, blockIdx: 0, embedding: vec(0, 1) });
    // ONE block, two chunks. `csls = max(0, distance − 1 + hubScore)`, lower is better:
    //   closer chunk  — distance ≈ 0.293 (vec(1,1) against the vec(1) query), hub 0.95 ⇒ ≈ 0.243
    //   hub-free one  — distance 1.0 (orthogonal), hub 0.0                    ⇒ 0.0  (the CSLS winner)
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 0,
      chunkIdx: 0,
      text: "the CLOSER chunk, in a crowded neighbourhood",
      embedding: vec(1, 1),
      hubScore: 0.95,
    });
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 0,
      chunkIdx: 1,
      text: "the DISTINCTIVE chunk, in an empty one",
      embedding: vec(0, 1),
      hubScore: 0,
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const result = await svc.discover({ ownerId: owner, queryText: "a duel at night", topN: 5 });

    expect(result).toHaveLength(1);
    expect(result[0]?.segments).toHaveLength(1);
    expect(result[0]?.segments[0]?.snippet).toContain("DISTINCTIVE");
  });
});

// #1467 item 6: `poolK` is `topN × FACTOR` handed straight to a DB limit, and SQLite reads a NEGATIVE limit
// as NO limit — a nonsense ask became a full scan of the owner's verbatim corpus.
describe("discover guards topN before it becomes a scan budget", () => {
  test.each([0, -1, 2.5])("refuses topN %s with SEARCH_INVALID_TOP_N", async (topN) => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const svc = makeSearch(db, { embedVector: () => vec(1) });

    await expect(svc.discover({ ownerId: owner, queryText: "anything", topN })).rejects.toMatchObject({ code: "invalid_top_n" });
  });
});
