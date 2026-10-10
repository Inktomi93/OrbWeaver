// persistence/queries — the staleness-gate reads + the hash-gated upserts + the hub-score batch, against a
// real db. Asserts: existing*Hash returns the stored hash (and undefined for a fresh key); the upserts are
// idempotent on their unique key (re-upsert updates in place, never doubles); a re-upsert NEVER touches
// hub_score; the round-trip Float32Array survives the F32_BLOB column.

import type { EmbeddingTask } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { characterEmbeddings, embedGenerations, embedGenerationTargets, imageAnalyses, imageEmbeddings } from "@orb/db";
import type { CharacterEmbeddingId, EmbedGenerationId, Handle, ImageEmbeddingId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { saveImageAnalysis } from "../../../../../packages/server/src/domain/embeddings/persistence/image-analysis.ts";
import {
  existingCharacterHash,
  existingImageHash,
  upsertCharacterEmbedding,
  upsertImageEmbedding,
  writeHubScoreRows,
} from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, IMAGE_EMBED_MODEL, seedAsset, seedCharacter, seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

async function seedGeneration(db: Db, ownerId: UserId, model: string, task: EmbeddingTask = "embed"): Promise<EmbedGenerationId> {
  const id = castId<EmbedGenerationId>(`embed_generation_${task}_${model}`);
  await db
    .insert(embedGenerations)
    .values({
      id,
      ownerId,
      task,
      via: task,
      connectionId: null,
      connectionRef: castId<UserConnectionId>(`fixture:${model}`),
      fingerprint: `fixture:${model}`,
      space: model,
      createdAt: NOW,
    })
    .onConflictDoNothing();
  // The owner's current target: an upsert lands only while its generation is one.
  await db
    .insert(embedGenerationTargets)
    .values({ ownerId, task, generationId: id, epoch: 1 })
    .onConflictDoUpdate({ target: [embedGenerationTargets.ownerId, embedGenerationTargets.task], set: { generationId: id } });
  return id;
}

describe("existingCharacterHash / upsertCharacterEmbedding", () => {
  test("undefined before any write; the stored hash after; idempotent on (characterId, model)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const generationId = await seedGeneration(db, owner, EMBED_MODEL);

    expect(await existingCharacterHash(db, characterId, generationId)).toBeUndefined();

    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_a"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "hash-1",
      model: EMBED_MODEL,
      generationId,
      dim: EMBED_DIM,
      now: NOW,
    });
    expect(await existingCharacterHash(db, characterId, generationId)).toBe("hash-1");

    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_b"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 5),
      contentHash: "hash-2",
      model: EMBED_MODEL,
      generationId,
      dim: EMBED_DIM,
      now: NOW,
    });
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentHash).toBe("hash-2");
    expect(rows[0]?.embedding).toBeInstanceOf(Float32Array);
    expect(rows[0]?.embedding).toHaveLength(EMBED_DIM);
  });

  test("a re-upsert preserves a hub_score written between the two upserts", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const generationId = await seedGeneration(db, owner, EMBED_MODEL);
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_a"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "hash-1",
      model: EMBED_MODEL,
      generationId,
      dim: EMBED_DIM,
      now: NOW,
    });
    const id = (await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId)))[0]?.id;
    await writeHubScoreRows(db, "character_embeddings", [{ id: id ?? "", model: EMBED_MODEL, hubScore: 0.55 }]);

    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_c"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 9),
      contentHash: "hash-3",
      model: EMBED_MODEL,
      generationId,
      dim: EMBED_DIM,
      now: NOW,
    });
    const row = (await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId)))[0];
    expect(row?.hubScore).toBeCloseTo(0.55);
    expect(row?.contentHash).toBe("hash-3");
  });
});

describe("existingImageHash / upsertImageEmbedding", () => {
  test("both lenses coexist while only the Utility writer authors the canonical caption", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner, { hash: "img-hash" });
    const generationId = await seedGeneration(db, owner, IMAGE_EMBED_MODEL, "imageEmbed");
    expect(await existingImageHash(db, assetId, "image-raw", generationId)).toBeUndefined();
    const common = {
      ownerId: owner,
      assetId,
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "img-hash",
      model: IMAGE_EMBED_MODEL,
      generationId,
      dim: EMBED_DIM,
      now: NOW,
    };
    await upsertImageEmbedding(db, { ...common, id: castId<ImageEmbeddingId>("image_embedding_raw"), lens: "image-raw", analysisRevision: null });
    const revision = await saveImageAnalysis(db, {
      ownerId: owner,
      assetId,
      generationId,
      contentHash: "img-hash",
      caption: "a caption",
      captionMeta: { model: "captioner", futureFacet: "preserved" },
      now: NOW,
    });
    expect(revision).toBe(1);
    if (revision === undefined) {
      return;
    }
    expect(
      await upsertImageEmbedding(db, { ...common, id: castId<ImageEmbeddingId>("image_embedding_cap"), lens: "image-captioned", analysisRevision: revision }),
    ).toBe(true);
    expect(await existingImageHash(db, assetId, "image-raw", generationId)).toBe("img-hash");
    expect(await db.select().from(imageEmbeddings)).toHaveLength(2);
    expect(await db.select().from(imageAnalyses)).toMatchObject([
      { assetId, caption: "a caption", captionMeta: { model: "captioner", futureFacet: "preserved" } },
    ]);
  });
});
