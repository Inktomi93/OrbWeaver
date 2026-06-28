// persistence/queries — the staleness-gate reads + the hash-gated upserts + the hub-score batch, against a
// real db. Asserts: existing*Hash returns the stored hash (and undefined for a fresh key); the upserts are
// idempotent on their unique key (re-upsert updates in place, never doubles); a re-upsert NEVER touches
// hub_score; the round-trip Float32Array survives the F32_BLOB column.

import { characterEmbeddings, imageEmbeddings } from "@orb/db";
import type { CharacterEmbeddingId, ImageEmbeddingId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import {
  existingCharacterHash,
  existingImageHash,
  upsertCharacterEmbedding,
  upsertImageEmbedding,
  writeHubScoreRows,
} from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import {
  EMBED_DIM,
  EMBED_MODEL,
  fakeVector,
  IMAGE_EMBED_MODEL,
  seedAsset,
  seedCharacter,
  seedUser,
} from "../_support.ts";

const NOW = 1_750_000_000_000;

describe("existingCharacterHash / upsertCharacterEmbedding", () => {
  test("undefined before any write; the stored hash after; idempotent on (characterId, model)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);

    expect(await existingCharacterHash(db, characterId, EMBED_MODEL)).toBeUndefined();

    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_a"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "hash-1",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    expect(await existingCharacterHash(db, characterId, EMBED_MODEL)).toBe("hash-1");

    // Re-upsert the same key with a new hash/vector — updates in place, no second row.
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_b"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 5),
      contentHash: "hash-2",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    const rows = await db
      .select()
      .from(characterEmbeddings)
      .where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentHash).toBe("hash-2");
    expect(rows[0]?.embedding).toBeInstanceOf(Float32Array);
    expect(rows[0]?.embedding).toHaveLength(EMBED_DIM);
  });

  test("a re-upsert preserves a hub_score written between the two upserts", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_a"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "hash-1",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    const id = (
      await db
        .select()
        .from(characterEmbeddings)
        .where(eq(characterEmbeddings.characterId, characterId))
    )[0]?.id;
    await writeHubScoreRows(db, "character_embeddings", [
      { id: id ?? "", model: EMBED_MODEL, hubScore: 0.55 },
    ]);

    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_c"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 9),
      contentHash: "hash-3",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    const row = (
      await db
        .select()
        .from(characterEmbeddings)
        .where(eq(characterEmbeddings.characterId, characterId))
    )[0];
    expect(row?.hubScore).toBeCloseTo(0.55);
    expect(row?.contentHash).toBe("hash-3");
  });
});

describe("existingImageHash / upsertImageEmbedding", () => {
  test("both lenses coexist per (asset, model); caption persists only on the captioned lens", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const assetId = await seedAsset(db, owner);

    expect(await existingImageHash(db, assetId, "image-raw", IMAGE_EMBED_MODEL)).toBeUndefined();

    await upsertImageEmbedding(db, {
      id: castId<ImageEmbeddingId>("image_embedding_raw"),
      assetId,
      lens: "image-raw",
      caption: null,
      captionMeta: null,
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "img-hash",
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertImageEmbedding(db, {
      id: castId<ImageEmbeddingId>("image_embedding_cap"),
      assetId,
      lens: "image-captioned",
      caption: "a caption",
      captionMeta: { model: "captioner" },
      embedding: fakeVector(EMBED_DIM, 3),
      contentHash: "img-hash",
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });

    expect(await existingImageHash(db, assetId, "image-raw", IMAGE_EMBED_MODEL)).toBe("img-hash");
    const rows = await db
      .select()
      .from(imageEmbeddings)
      .where(eq(imageEmbeddings.assetId, assetId));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.lens === "image-raw")?.caption).toBeNull();
    expect(rows.find((r) => r.lens === "image-captioned")?.caption).toBe("a caption");
  });
});
