// verb: images — cross-modal text→image retrieval (PD-36). Asserts the W3 cross-modal behaviours against a
// real db + a scripted role-clients bundle: text→image ranking by RAW cosine distance, owner-scoping (via
// assets.ownerId), lens gating (only the requested lens is scanned), caption rerank reordering, the empty-
// query SearchError, and — THE LOAD-BEARING INVARIANT — that a hub-score-dominant outlier does NOT outrank a
// relevant match (the verb skips CSLS on the cross-modal path; applying `hub_score` would invert the order).

import { SearchError } from "@orb/server/domain/search";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeSearch, seedAsset, seedImageEmbedding, seedUser, vec } from "../_support.ts";

describe("images", () => {
  test("returns the closest cross-modal image first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const near = await seedAsset(db, { id: "asset_near", ownerId: owner, hash: "hash_near" });
    const far = await seedAsset(db, { id: "asset_far", ownerId: owner, hash: "hash_far" });
    await seedImageEmbedding(db, { assetId: near, embedding: vec(1) });
    await seedImageEmbedding(db, { assetId: far, embedding: vec(0, 1) });

    const svc = makeSearch(db, { imageEmbedVector: () => vec(1) });
    const hits = await svc.images({
      ownerId: owner,
      query: "a knight",
      topN: 2,
      lens: "image-captioned",
    });

    expect(hits.map((h) => h.assetId)).toEqual([near, far]);
  });

  test("never returns another owner's image", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedAsset(db, { id: "asset_mine", ownerId: owner, hash: "hash_mine" });
    const theirs = await seedAsset(db, { id: "asset_theirs", ownerId: other, hash: "hash_theirs" });
    await seedImageEmbedding(db, { assetId: mine, embedding: vec(1) });
    await seedImageEmbedding(db, { assetId: theirs, embedding: vec(1) });

    const svc = makeSearch(db, { imageEmbedVector: () => vec(1) });
    const hits = await svc.images({
      ownerId: owner,
      query: "q",
      topN: 10,
      lens: "image-captioned",
    });

    expect(hits.map((h) => h.assetId)).toEqual([mine]);
  });

  test("scans ONLY the requested lens (both coexist per asset)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const asset = await seedAsset(db, { id: "asset_a", ownerId: owner, hash: "hash_a" });
    // Same asset, two lenses in one space: captioned matches the query, raw is orthogonal.
    await seedImageEmbedding(db, {
      id: "ie_captioned",
      assetId: asset,
      lens: "image-captioned",
      embedding: vec(1),
    });
    await seedImageEmbedding(db, {
      id: "ie_raw",
      assetId: asset,
      lens: "image-raw",
      embedding: vec(0, 1),
    });

    const svc = makeSearch(db, { imageEmbedVector: () => vec(1) });
    const captioned = await svc.images({
      ownerId: owner,
      query: "q",
      topN: 5,
      lens: "image-captioned",
    });
    const raw = await svc.images({ ownerId: owner, query: "q", topN: 5, lens: "image-raw" });

    expect(captioned.map((h) => h.lens)).toEqual(["image-captioned"]);
    expect(raw.map((h) => h.lens)).toEqual(["image-raw"]);
    // Both resolve the same asset (one lens each), so the hit count is one per lens — never mixed.
    expect(captioned).toHaveLength(1);
    expect(raw).toHaveLength(1);
  });

  test("a hub-dominant outlier does NOT outrank a relevant match (the CSLS-skip invariant)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    // The RELEVANT avatar: closer to the text query (cos 0.8, distance 0.2) but a high hub_score.
    const relevant = await seedAsset(db, { id: "asset_rel", ownerId: owner, hash: "hash_rel" });
    // The GENERIC outlier: farther from the query (cos 0.6, distance 0.4) but a low hub_score. If the verb
    // (wrongly) folded `hub_score` into the score, CSLS would rank this generic avatar FIRST (0.4−1+0.5 < a
    // clamped 0.2−1+0.9) — the exact inversion the invariant guards against.
    const outlier = await seedAsset(db, { id: "asset_out", ownerId: owner, hash: "hash_out" });
    await seedImageEmbedding(db, {
      assetId: relevant,
      embedding: vec(0.8, 0.6),
      hubScore: 0.9,
    });
    await seedImageEmbedding(db, {
      assetId: outlier,
      embedding: vec(0.6, 0.8),
      hubScore: 0.5,
    });

    const svc = makeSearch(db, { imageEmbedVector: () => vec(1) });
    const hits = await svc.images({
      ownerId: owner,
      query: "a knight",
      topN: 2,
      lens: "image-captioned",
    });

    // RAW cosine distance ordering: the relevant (nearer) match wins; hub_score is never applied.
    expect(hits.map((h) => h.assetId)).toEqual([relevant, outlier]);
  });

  test("rerank reorders by the caption cross-encoder (mocked) when enabled", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedAsset(db, { id: "asset_a", ownerId: owner, hash: "hash_a" });
    const b = await seedAsset(db, { id: "asset_b", ownerId: owner, hash: "hash_b" });
    await seedImageEmbedding(db, { assetId: a, embedding: vec(1), caption: "a knight in armor" });
    await seedImageEmbedding(db, { assetId: b, embedding: vec(0.9, 0.1), caption: "a dragon" });

    // Raw-distance order is [a, b]; a rerank that reverses the caption documents must flip it to [b, a].
    const svc = makeSearch(db, {
      imageEmbedVector: () => vec(1),
      rerank: (_q, documents) =>
        Promise.resolve({
          hits: [...documents].reverse().map((d, i) => ({ id: d.id, score: documents.length - i })),
          model: "rerank",
          usage: { totalTokens: null },
        }),
    });

    const raw = await svc.images({
      ownerId: owner,
      query: "q",
      topN: 2,
      lens: "image-captioned",
    });
    expect(raw.map((h) => h.assetId)).toEqual([a, b]);

    const reranked = await svc.images({
      ownerId: owner,
      query: "q",
      topN: 2,
      lens: "image-captioned",
      rerank: true,
    });
    expect(reranked.map((h) => h.assetId)).toEqual([b, a]);
  });

  test("a query that embeds to nothing throws a typed SearchError", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });

    const svc = makeSearch(db, { imageEmbedVector: () => null });
    await expect(
      svc.images({ ownerId: owner, query: "anything", topN: 5, lens: "image-captioned" }),
    ).rejects.toBeInstanceOf(SearchError);
  });
});
