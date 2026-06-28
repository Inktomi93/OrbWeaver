// verb: findCharacters — knn + distilled-facet enrichment (the primitive discovery W3 consumes). Asserts:
// hits carry the summary facets + avatar hash; a card with no summary still returns (null facets); the
// result respects topN; and the rerank order from the underlying knn passes through to the enriched hits.

import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import {
  makeSearch,
  seedAsset,
  seedCharacter,
  seedCharacterEmbedding,
  seedCharacterSummary,
  seedUser,
  vec,
} from "../_support.ts";

describe("findCharacters", () => {
  test("enriches hits with summary facets + the avatar CAS hash", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { id: "asset_av", ownerId: owner, hash: "avhash" });
    const c = await seedCharacter(db, {
      id: "character_nyx",
      ownerId: owner,
      name: "Nyx",
      avatarAssetId: avatar,
    });
    await seedCharacterEmbedding(db, { characterId: c, embedding: vec(1) });
    await seedCharacterSummary(db, {
      characterId: c,
      genre: "noir",
      tone: "brooding",
      elevatorPitch: "a shadow witch",
    });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.findCharacters({ ownerId: owner, query: "q", topN: 5 });

    expect(hits).toHaveLength(1);
    const hit = hits[0];
    expect(hit?.characterId).toBe(c);
    expect(hit?.name).toBe("Nyx");
    expect(hit?.avatarHash).toBe("avhash");
    expect(hit?.genre).toBe("noir");
    expect(hit?.elevatorPitch).toBe("a shadow witch");
  });

  test("a card with no summary is still returned, with null facets", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const c = await seedCharacter(db, { id: "character_bare", ownerId: owner, name: "Bare" });
    await seedCharacterEmbedding(db, { characterId: c, embedding: vec(1) });

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.findCharacters({ ownerId: owner, query: "q", topN: 5 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.genre).toBeNull();
    expect(hits[0]?.avatarHash).toBeNull();
  });

  test("respects topN", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await Promise.all(
      Array.from({ length: 4 }, async (_unused, i) => {
        const id = await seedCharacter(db, {
          id: `character_${i}`,
          ownerId: owner,
          name: `C${i}`,
        });
        await seedCharacterEmbedding(db, { characterId: id, embedding: vec(1, i) });
      }),
    );

    const svc = makeSearch(db, { embedVector: () => vec(1) });
    const hits = await svc.findCharacters({ ownerId: owner, query: "q", topN: 2 });

    expect(hits).toHaveLength(2);
  });

  test("rerank order from knn passes through to the enriched hits", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    await seedCharacterEmbedding(db, { characterId: a, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: b, embedding: vec(0.9, 0.1) });

    const svc = makeSearch(db, {
      embedVector: () => vec(1),
      rerank: (_q, documents) =>
        Promise.resolve({
          hits: [...documents].reverse().map((d, i) => ({ id: d.id, score: documents.length - i })),
          model: "rerank",
          usage: { totalTokens: null },
        }),
    });

    const hits = await svc.findCharacters({ ownerId: owner, query: "q", topN: 2, rerank: true });
    expect(hits.map((h) => h.characterId)).toEqual([b, a]);
  });
});
