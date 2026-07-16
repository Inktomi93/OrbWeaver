// verb: knn — the within-space top-k card scan (embed → scan → CSLS → optional rerank). Asserts the W2
// core behaviours against a real db + a scripted role-clients bundle: within-space retrieval ordered by
// similarity, candidate pooling capped to topN, owner-scoping, rerank reordering (mocked rerank), the
// hosted not-supported rerank path PROPAGATING (no silent fallback), and the empty-query SearchError.

import { SearchError } from "@orb/server/domain/search";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeSearch, seedCharacter, seedCharacterEmbedding, seedUser, vec } from "../_support.ts";

describe("knn", () => {
  test("returns the closest in-space card first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const near = await seedCharacter(db, { id: "character_near", ownerId: owner, name: "Near" });
    const far = await seedCharacter(db, { id: "character_far", ownerId: owner, name: "Far" });
    await seedCharacterEmbedding(db, { characterId: near, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: far, embedding: vec(0, 1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.knn({ ownerId: owner, query: "anything", topN: 2 });

    expect(hits.map((h) => h.characterId)).toEqual([near, far]);
  });

  test("over-fetches a pool but caps the result to topN", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await Promise.all(
      Array.from({ length: 6 }, async (_unused, i) => {
        const id = await seedCharacter(db, {
          id: `character_${i}`,
          ownerId: owner,
          name: `C${i}`,
        });
        await seedCharacterEmbedding(db, { characterId: id, embedding: vec(1, i) });
      }),
    );

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.knn({ ownerId: owner, query: "q", topN: 3 });

    expect(hits).toHaveLength(3);
  });

  test("never returns another owner's card", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    await seedCharacterEmbedding(db, { characterId: mine, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: theirs, embedding: vec(1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.knn({ ownerId: owner, query: "q", topN: 10 });

    expect(hits.map((h) => h.characterId)).toEqual([mine]);
  });

  test("rerank reorders the result by the cross-encoder (mocked) when enabled", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    await seedCharacterEmbedding(db, { characterId: a, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: b, embedding: vec(0.9, 0.1) });

    // CSLS order is [a, b]; a rerank that reverses the documents must flip the result to [b, a].
    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: (_q, documents) =>
        Promise.resolve({
          hits: [...documents].reverse().map((d, i) => ({ id: d.id, score: documents.length - i })),
          model: "rerank",
          usage: { totalTokens: null },
        }),
    });

    const csls = await svc.knn({ ownerId: owner, query: "q", topN: 2 });
    expect(csls.map((h) => h.characterId)).toEqual([a, b]);

    const reranked = await svc.knn({ ownerId: owner, query: "q", topN: 2, rerank: true });
    expect(reranked.map((h) => h.characterId)).toEqual([b, a]);
  });

  test("a hosted not-supported rerank throw PROPAGATES (no silent CSLS fallback)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    await seedCharacterEmbedding(db, { characterId: a, embedding: vec(1) });

    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: () => Promise.reject(new Error("rerank not supported on this backend")),
    });

    await expect(svc.knn({ ownerId: owner, query: "q", topN: 5, rerank: true })).rejects.toThrow("rerank not supported");
  });

  test("a query that embeds to nothing throws a typed SearchError", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });

    const svc = makeSearch(db, { embedVector: () => null });
    await expect(svc.knn({ ownerId: owner, query: "   ", topN: 5 })).rejects.toBeInstanceOf(SearchError);
  });
});
