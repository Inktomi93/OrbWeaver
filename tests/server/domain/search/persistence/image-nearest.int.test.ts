// persistence/image-nearest — the cross-modal text→image vector_distance_cos scan. Asserts the three
// WHERE-clause belts against a real libSQL db: OWNER-SCOPE (another owner's image is never returned, via
// assets.ownerId), WITHIN-SPACE (a row in a different `model` space is never returned), and LENS (only the
// requested lens is scanned, though both coexist per asset), plus ascending-by-distance ordering and the
// caption passthrough.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { nearestImages } from "../../../../../packages/server/src/domain/search/persistence/image-nearest.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { IMAGE_EMBED_MODEL, seedAsset, seedImageEmbedding, seedUser, vec } from "../_support.ts";

describe("nearestImages", () => {
  test("returns the owner's in-space images ordered ascending by distance", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const near = await seedAsset(db, { id: "asset_near", ownerId: owner, hash: "hash_near" });
    const far = await seedAsset(db, { id: "asset_far", ownerId: owner, hash: "hash_far" });
    await seedImageEmbedding(db, { assetId: near, embedding: vec(1) });
    await seedImageEmbedding(db, { assetId: far, embedding: vec(0, 1) });

    const rows = await nearestImages(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: IMAGE_EMBED_MODEL,
      lens: "image-captioned",
      limit: 10,
    });

    expect(rows.map((r) => r.assetId)).toEqual([near, far]);
    expect(rows[0]?.distance).toBeLessThan(rows[1]?.distance ?? Number.POSITIVE_INFINITY);
  });

  test("never returns another owner's image (owner-scope belt via assets.ownerId)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const mine = await seedAsset(db, { id: "asset_mine", ownerId: owner, hash: "hash_mine" });
    const theirs = await seedAsset(db, { id: "asset_theirs", ownerId: other, hash: "hash_theirs" });
    await seedImageEmbedding(db, { assetId: mine, embedding: vec(1) });
    await seedImageEmbedding(db, { assetId: theirs, embedding: vec(1) });

    const rows = await nearestImages(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: IMAGE_EMBED_MODEL,
      lens: "image-captioned",
      limit: 10,
    });

    expect(rows.map((r) => r.assetId)).toEqual([mine]);
  });

  test("scans only the requested lens (both lenses coexist per asset)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const asset = await seedAsset(db, { id: "asset_a", ownerId: owner, hash: "hash_a" });
    await seedImageEmbedding(db, {
      id: "ie_captioned",
      assetId: asset,
      lens: "image-captioned",
      embedding: vec(1),
      caption: "a caption",
    });
    await seedImageEmbedding(db, {
      id: "ie_raw",
      assetId: asset,
      lens: "image-raw",
      embedding: vec(1),
    });

    const rows = await nearestImages(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: IMAGE_EMBED_MODEL,
      lens: "image-captioned",
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.caption).toBe("a caption");
  });

  test("never returns a row from a different embedding space (model filter)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const inSpace = await seedAsset(db, { id: "asset_in", ownerId: owner, hash: "hash_in" });
    const otherSpace = await seedAsset(db, {
      id: "asset_other",
      ownerId: owner,
      hash: "hash_other",
    });
    await seedImageEmbedding(db, { assetId: inSpace, embedding: vec(1) });
    await seedImageEmbedding(db, {
      assetId: otherSpace,
      embedding: vec(1),
      model: "a-different-space-model",
    });

    const rows = await nearestImages(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: IMAGE_EMBED_MODEL,
      lens: "image-captioned",
      limit: 10,
    });

    expect(rows.map((r) => r.assetId)).toEqual([inSpace]);
  });
});
