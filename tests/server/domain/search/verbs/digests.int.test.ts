// verb: digests — within-chat distilled-lens retrieval (the ONLY search op `memory.recall` calls, mixB/mixC).
// Asserts against a real db + scripted role-clients: cosine ranking, the SPACE belt (a different-`model` row
// is excluded), the `scope.chat` belt (another chat's digest is excluded), the `candidates` restriction
// (score ONLY the given block-keys), the `keywordMatch` fold (a below-floor row kept on keyword overlap),
// mode `mixC` rerank reorder, and the empty-candidates short-circuit.

import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeSearch, seedCharacter, seedChat, seedChatDigest, seedUser, vec } from "../_support.ts";

/** A `MemoryQueryOptions` with the within-chat defaults filled; override per test. */
function opts(
  chat: ChatId,
  scopedCharacterId: CharacterId,
  over: Partial<MemoryQueryOptions> = {},
): MemoryQueryOptions {
  return {
    scope: { chat },
    queryText: "anything",
    scopedCharacterId,
    mode: "mixB",
    verbatimWindow: 0,
    keywordMatch: false,
    recencyBias: 0,
    minScore: 0,
    ...over,
  };
}

async function seedOwnerChatChar(
  db: Awaited<ReturnType<typeof freshDb>>,
): Promise<{ chat: ChatId; char: CharacterId }> {
  const owner = await seedUser(db, { handle: "owner" });
  const char = await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
  const chat = await seedChat(db, "chat_a");
  return { chat, char };
}

describe("digests", () => {
  test("ranks within-chat digests by cosine (near before far)", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
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

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.digests(opts(chat, char));

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([0, 1]);
    expect(hits[0]?.blockKey.scopedCharacterId).toBe(char);
  });

  test("the SPACE belt excludes a different-model digest", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
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

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.digests(opts(chat, char));

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([0]);
  });

  test("the scope.chat belt excludes another chat's digest", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    const other = await seedChat(db, "chat_other");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigest(db, {
      chatId: other,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.digests(opts(chat, char));

    expect(hits).toHaveLength(1);
    expect(hits[0]?.blockKey.chatId).toBe(chat);
  });

  test("the candidates restriction scores only the given block-keys", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await Promise.all(
      [0, 1, 2].map((blockIdx) =>
        seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx, embedding: vec(1) }),
      ),
    );

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.digests(
      opts(chat, char, {
        candidates: [{ chatId: chat, tier: 0, blockIdx: 1, scopedCharacterId: char }],
      }),
    );

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([1]);
  });

  test("empty candidates short-circuits to no scan", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(1),
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.digests(opts(chat, char, { candidates: [] }));

    expect(hits).toEqual([]);
  });

  test("keywordMatch folds a below-floor digest in on keyword overlap", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    // Orthogonal to the query (cosine sim 0) — below a 0.5 floor, but its keyword overlaps the query.
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(0, 1),
      keywords: ["dragon"],
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const floored = await svc.digests(opts(chat, char, { minScore: 0.5, queryText: "the dragon" }));
    expect(floored).toHaveLength(0);

    const folded = await svc.digests(
      opts(chat, char, { minScore: 0.5, keywordMatch: true, queryText: "the dragon" }),
    );
    expect(folded.map((h) => h.blockKey.blockIdx)).toEqual([0]);
  });

  test("mode mixC reranks the result by the cross-encoder", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
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

    const csls = await svc.digests(opts(chat, char, { mode: "mixB" }));
    expect(csls.map((h) => h.blockKey.blockIdx)).toEqual([0, 1]);

    const reranked = await svc.digests(opts(chat, char, { mode: "mixC" }));
    expect(reranked.map((h) => h.blockKey.blockIdx)).toEqual([1, 0]);
  });
});
