// verb: digests — within-chat distilled-lens retrieval (the ONLY search op `memory.recall` calls, mixB/mixC).
// Asserts against a real db + scripted role-clients: cosine ranking, the SPACE belt (a different-`model` row
// is excluded), the `scope.chat` belt (another chat's digest is excluded), the `candidates` restriction
// (score ONLY the given block-keys), the `keywordMatch` fold (a below-floor row kept on keyword overlap),
// mode `mixC` rerank reorder, and the empty-candidates short-circuit.

import type { MemoryQueryOptions } from "@orb/contracts/search";
import { ProviderError } from "@orb/inference";
import type { CharacterId, ChatId, Handle , UserId} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { SCOPE_INSTRUCTIONS } from "../../../../../packages/server/src/domain/search/substrate/instructions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeSearch, seedCharacter, seedChat, seedChatDigest, seedUser, vec } from "../_support.ts";

/** A `MemoryQueryOptions` with the within-chat defaults filled; override per test. */
function opts(chat: ChatId, scopedCharacterId: CharacterId, over: Partial<MemoryQueryOptions> = {}): MemoryQueryOptions {
  return {
    scope: { chat },
    ownerId: castId<UserId>("user_owner"),
    queryText: "anything",
    scopedCharacterId,
    mode: "mixB",
    keywordMatch: false,
    minScore: 0,
    // Wide enough to never cut these small fixtures — the pre-knob "keep all ranked" behaviour these belt
    // assertions were written against (a per-test `over` narrows them when the cut itself is under test).
    retrieveK: 100,
    rerankTo: 100,
    ...over,
  };
}

async function seedOwnerChatChar(db: Awaited<ReturnType<typeof freshDb>>): Promise<{ chat: ChatId; char: CharacterId }> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    await Promise.all([0, 1, 2].map((blockIdx) => seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx, embedding: vec(1) })));

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

    const folded = await svc.digests(opts(chat, char, { minScore: 0.5, keywordMatch: true, queryText: "the dragon" }));
    expect(folded.map((h) => h.blockKey.blockIdx)).toEqual([0]);
  });

  // #330 P3 (RED-FIRST): the within-chat digest scan conditions its embed + rerank with the digests
  // SCOPE_INSTRUCTIONS — the SAME per-task hint the corpus digest scan uses. OLD: it embedded + reranked BARE,
  // the weaker sibling of the corpus path on an instruction-aware family (Qwen3-VL).
  test("the embed + rerank carry the digests SCOPE_INSTRUCTIONS (#330 P3)", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx: 0, embedding: vec(1) });

    const embedInstructions: (string | undefined)[] = [];
    const rerankQueries: string[] = [];
    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      onEmbed: (_input, embedOpts) => embedInstructions.push(embedOpts?.instruction),
      rerank: (rerankQuery, docs) => {
        rerankQueries.push(typeof rerankQuery === "string" ? rerankQuery : (rerankQuery.text ?? ""));
        return Promise.resolve({ hits: docs.map((d, i) => ({ id: d.id, score: docs.length - i })), model: "rerank", usage: { totalTokens: null } });
      },
    });

    await svc.digests(opts(chat, char, { mode: "mixC" }));

    expect(embedInstructions).toContain(SCOPE_INSTRUCTIONS.digests.query);
    expect(rerankQueries.at(0)?.startsWith(SCOPE_INSTRUCTIONS.digests.rerank)).toBe(true);
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

  test("mode mixC falls back to the complete already-retrieved vector order when reranking rejects", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx: 0, embedding: vec(1) });
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx: 1, embedding: vec(0.9, 0.1) });

    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: () => Promise.reject(new Error("rerank engine unavailable")),
    });
    let unavailable = 0;
    // `rerankTo: 1` is deliberate: graceful degradation returns the FULL retrieveK vector result, never a
    // partial rerank-shaped prefix left behind by the failed call.
    const hits = await svc.digests(opts(chat, char, { mode: "mixC", retrieveK: 2, rerankTo: 1 }), {
      onRerankUnavailable: () => {
        unavailable += 1;
      },
    });

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([0, 1]);
    expect(hits).toHaveLength(2);
    expect(unavailable).toBe(1);
  });

  test("mode mixB never reports rerank unavailable and never calls the reranker", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx: 0, embedding: vec(1) });

    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: () => Promise.reject(new Error("mixB must not call rerank")),
    });
    let unavailable = 0;
    const hits = await svc.digests(opts(chat, char, { mode: "mixB" }), {
      onRerankUnavailable: () => {
        unavailable += 1;
      },
    });

    expect(hits.map((h) => h.blockKey.blockIdx)).toEqual([0]);
    expect(unavailable).toBe(0);
  });

  // ── #1603: a SIDE-ROLE provider failure leaves this verb NAMING ITS ROLE ───────────────────────────────
  // The embed await had no catch, so a 401 on the EMBED role's own key (role clients resolve their own
  // credential per call — it need not be the chat connection's key at all) escaped anonymously into the chat
  // turn's whole-body catch. That catch correctly refuses to strike the chat credential for it (#1373 leg 3),
  // so the user got a turn failure that named no role and no key. This verb is the last place that still
  // knows which role produced the failure.
  test("#1603 an embed-role auth failure is re-framed NAMING the role, with its classification intact", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx: 0, embedding: vec(1) });

    const rejected = new ProviderError({ kind: "auth_failed", retryable: false, message: "the endpoint rejected the key (401)", apiErrorStatus: 401 });
    const svc = makeSearch(db, { embed: () => Promise.reject(rejected) });

    const err = await svc.digests(opts(chat, char, { mode: "mixB" })).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderError);
    // The ROLE is named to the human who has to go fix a key…
    expect((err as ProviderError).message).toContain("embed");
    // …and the provider's own classification survives the re-frame (never re-derived, never flattened).
    expect(err).toMatchObject({ kind: "auth_failed", retryable: false, apiErrorStatus: 401 });
    expect((err as ProviderError).cause).toBeInstanceOf(ProviderError);
  });

  test("#1603 …but a NON-provider failure passes through untouched — it is not ours to re-frame", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    await seedChatDigest(db, { chatId: chat, scopedCharacterId: char, blockIdx: 0, embedding: vec(1) });
    const bug = new Error("the vector store is on fire");

    const svc = makeSearch(db, { embed: () => Promise.reject(bug) });

    // Identity, not shape: a db fault or a bug of ours says nothing about anyone's credential, and wearing a
    // role-named provider message would send the user to fix a key that is fine.
    await expect(svc.digests(opts(chat, char, { mode: "mixB" }))).rejects.toBe(bug);
  });
});

// #1467 item 6: `WORD_SPLIT` was `[^a-z0-9]+`, so every Cyrillic / Greek / CJK / accented character counted as
// a SEPARATOR and a query in one of those scripts tokenized to nothing — the documented keyword fallback
// could never fire for a whole population of corpora.
describe("the keywordMatch fallback tokenizes every script", () => {
  test("a Cyrillic keyword match rescues a digest that missed the vector floor", async () => {
    const db = await freshDb();
    const { chat, char } = await seedOwnerChatChar(db);
    // Orthogonal to the query vector — distance 1, so `1 − distance = 0` is below the floor. Only the keyword
    // arm can keep this row, and only if the query tokenizes at all.
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: char,
      blockIdx: 0,
      embedding: vec(0, 1),
      keywords: ["дракон"],
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.digests(opts(chat, char, { queryText: "дракон в горах", keywordMatch: true, minScore: 0.5 }));

    expect(hits).toHaveLength(1);
    expect(hits[0]?.blockKey.blockIdx).toBe(0);
  });
});
