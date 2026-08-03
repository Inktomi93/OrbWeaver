// verb: segments — within-chat verbatim-lens retrieval. Asserts cosine ranking + the tier-0/egocentric
// BlockKey stamping, the SPACE + scope.chat belts, the candidates `(chatId, blockIdx)` restriction, the
// REQUIRED-scopedCharacterId throw (the verbatim lens cannot key without an egocentric POV), and mixC rerank.

import type { MemoryQueryOptions } from "@orb/contracts/search";
import type { CharacterId, ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { SearchError } from "@orb/server/domain/search";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeSearch, seedCharacter, seedChat, seedChatSegment, seedUser, vec } from "../_support.ts";

function opts(chat: ChatId, scopedCharacterId: CharacterId | undefined, over: Partial<MemoryQueryOptions> = {}): MemoryQueryOptions {
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

async function seedOwnerChatChar(db: Awaited<ReturnType<typeof freshDb>>): Promise<{ chat: ChatId; char: CharacterId }> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const char = await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
  const chat = await seedChat(db, "chat_a");
  return { chat, char };
}

describe("segments", () => {
  test("ranks verbatim blocks by cosine + stamps a tier-0 egocentric BlockKey", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, embedding: vec(1) });
    await seedChatSegment(db, { chatId: chat, blockIdx: 1, embedding: vec(0, 1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.segments(opts(chat, char));

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([0, 1]);
    expect(hits[0]?.blockKey.tier).toBe(0);
    expect(hits[0]?.blockKey.scopedCharacterId).toBe(char);
  });

  test("throws SCOPE_REQUIRED without an egocentric scopedCharacterId", async () => {
    const db = await freshDb();
    const { chat } = await seedOwnerChatChar(db);
    const svc = makeSearch(db, { embedVector: () => vec(1) });

    await expect(svc.segments(opts(chat, undefined))).rejects.toBeInstanceOf(SearchError);
  });

  test("the SPACE belt excludes a different-model segment", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, embedding: vec(1) });
    await seedChatSegment(db, {
      chatId: chat,
      blockIdx: 1,
      embedding: vec(1),
      model: "other-space",
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.segments(opts(chat, char));

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([0]);
  });

  test("the candidates restriction scores only the given blocks", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await Promise.all([0, 1, 2].map((blockIdx) => seedChatSegment(db, { chatId: chat, blockIdx, embedding: vec(1) })));

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.segments(
      opts(chat, char, {
        candidates: [{ chatId: chat, tier: 0, blockIdx: 2, scopedCharacterId: char }],
      }),
    );

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([2]);
  });

  test("mode mixC reranks the verbatim result", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, embedding: vec(1) });
    await seedChatSegment(db, { chatId: chat, blockIdx: 1, embedding: vec(0.9, 0.1) });

    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: (_q, documents) =>
        Promise.resolve({
          hits: [...documents].reverse().map((d, i) => ({ id: d.id, score: documents.length - i })),
          model: "rerank",
          usage: { totalTokens: null },
        }),
    });

    const reranked = await svc.segments(opts(chat, char, { mode: "mixC" }));
    expect(reranked.map((h) => h.blockKey.blockIdx)).toEqual([1, 0]);
  });
});
