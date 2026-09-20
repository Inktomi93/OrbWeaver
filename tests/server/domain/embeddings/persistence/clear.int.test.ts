// persistence/clear — clearVectorTable (the whole-table wipe) + purgeStaleVectors (the PD-104 old-space
// reclaim). clearVectorTable asserts the typed DELETE FROM empties exactly the named table.
// purgeStaleVectors asserts the model-change UNIFORMITY invariant: across BOTH a table that used to ORPHAN
// on a model change (character_embeddings, keyed on model) AND a table that used to OVERWRITE in place
// (chat_segments/chat_digests, which now key on model too), a new `(model, dim)` space is written
// ADDITIVELY beside the old one, and the purge reclaims the old space leaving zero stale-space rows.

import { characterEmbeddings, chatDigests, chatSegments, documentChunks, imageEmbeddings } from "@orb/db";
import type { CharacterEmbeddingId, ChatDigestId, ChatSegmentId, DocumentChunkId, Handle, ImageEmbeddingId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { clearVectorTable, purgeStaleVectors } from "../../../../../packages/server/src/domain/embeddings/persistence/clear.ts";
import {
  upsertCharacterEmbedding,
  upsertChatDigest,
  upsertChatSegment,
  upsertDocumentChunk,
  upsertImageEmbedding,
} from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, IMAGE_EMBED_MODEL, seedAsset, seedCharacter, seedChat, seedDocument, seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;
const OLD_MODEL = "old-embed-model-v1";
const OLD_IMAGE_MODEL = "old-image-model-v1";

describe("clearVectorTable", () => {
  test("empties the named table", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_a"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    expect(await db.select().from(characterEmbeddings)).toHaveLength(1);

    await clearVectorTable(db, "character_embeddings");

    expect(await db.select().from(characterEmbeddings)).toHaveLength(0);
  });
});

describe("purgeStaleVectors (PD-104 model-change purge+reindex)", () => {
  test("character_embeddings — the previously-ORPHANING family: a model change coexists additively, then the old space purges clean", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    // Space A (the old model), then space B (the new model). The upsert keys on (characterId, model), so
    // B INSERTS beside A rather than replacing it — the "orphan" the ORIGINAL bug stranded forever.
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_old"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: OLD_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_new"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    expect(await db.select().from(characterEmbeddings)).toHaveLength(2); // both spaces coexist

    const purged = await purgeStaleVectors(db, "character_embeddings", owner, EMBED_MODEL);

    expect(purged).toBe(1);
    const rows = await db.select().from(characterEmbeddings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(EMBED_MODEL); // ONLY the active space survives — no orphan in the old one
  });

  test("chat_segments — the previously-OVERWRITING family: a model change now INSERTS additively (not in place), then purges clean", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const chatId = await seedChat(db, "chat_test", owner);
    // The SAME (chatId, blockIdx) in two models. BEFORE PD-104 the key omitted `model`, so the second
    // upsert OVERWROTE the first in place (silently corrupting a mixed-space table); now `model` is in the
    // key so both coexist — the uniform behaviour the fix guarantees.
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_old"),
      chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "verbatim block",
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: OLD_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_new"),
      chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "verbatim block",
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    expect(await db.select().from(chatSegments)).toHaveLength(2); // additive — NOT an in-place overwrite

    const purged = await purgeStaleVectors(db, "chat_segments", owner, EMBED_MODEL);

    expect(purged).toBe(1);
    const rows = await db.select().from(chatSegments);
    expect(rows.map((r) => r.model)).toEqual([EMBED_MODEL]); // old space reclaimed, no strand
  });

  test("UNIFORMITY INVARIANT: all five live vector tables purge the old space identically — zero stale-space rows remain anywhere", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const assetId = await seedAsset(db, owner);
    const chatId = await seedChat(db, "chat_test", owner);
    const documentId = await seedDocument(db, owner);

    // Seed one OLD-space + one NEW-space row in every table (image on its own model axis).
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_old"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: OLD_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_new"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertImageEmbedding(db, {
      id: castId<ImageEmbeddingId>("image_embedding_old"),
      assetId,
      lens: "image-raw",
      caption: null,
      captionMeta: null,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: OLD_IMAGE_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertImageEmbedding(db, {
      id: castId<ImageEmbeddingId>("image_embedding_new"),
      assetId,
      lens: "image-raw",
      caption: null,
      captionMeta: null,
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_old"),
      chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "block",
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: OLD_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_new"),
      chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "block",
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertChatDigest(db, {
      id: castId<ChatDigestId>("chat_digest_old"),
      chatId,
      scopedCharacterId: characterId,
      isGroup: false,
      tier: 0,
      blockIdx: 0,
      text: "digest",
      topicAnchor: "[a — scene]",
      keywords: ["k"],
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: OLD_MODEL,
      dim: EMBED_DIM,
      now: NOW,
      speakerCharacterIds: [],
    });
    await upsertChatDigest(db, {
      id: castId<ChatDigestId>("chat_digest_new"),
      chatId,
      scopedCharacterId: characterId,
      isGroup: false,
      tier: 0,
      blockIdx: 0,
      text: "digest",
      topicAnchor: "[a — scene]",
      keywords: ["k"],
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
      speakerCharacterIds: [],
    });
    // document_chunks — the 5th producer (PD-139(c)): the same (documentId, chunkIdx) in two model spaces.
    await upsertDocumentChunk(db, {
      id: castId<DocumentChunkId>("document_chunk_old"),
      documentId,
      chunkIdx: 0,
      content: "chunk",
      charStart: 0,
      charEnd: 5,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: OLD_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertDocumentChunk(db, {
      id: castId<DocumentChunkId>("document_chunk_new"),
      documentId,
      chunkIdx: 0,
      content: "chunk",
      charStart: 0,
      charEnd: 5,
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });

    // Purge each table's old space against its active model.
    expect(await purgeStaleVectors(db, "character_embeddings", owner, EMBED_MODEL)).toBe(1);
    expect(await purgeStaleVectors(db, "image_embeddings", owner, IMAGE_EMBED_MODEL)).toBe(1);
    expect(await purgeStaleVectors(db, "chat_segments", owner, EMBED_MODEL)).toBe(1);
    expect(await purgeStaleVectors(db, "chat_digests", owner, EMBED_MODEL)).toBe(1);
    expect(await purgeStaleVectors(db, "document_chunks", owner, EMBED_MODEL)).toBe(1);

    // The invariant: every table retains EXACTLY its active-space row and nothing outside it.
    const stale = [
      ...(await db.select().from(characterEmbeddings)).filter((r) => r.model !== EMBED_MODEL),
      ...(await db.select().from(imageEmbeddings)).filter((r) => r.model !== IMAGE_EMBED_MODEL),
      ...(await db.select().from(chatSegments)).filter((r) => r.model !== EMBED_MODEL),
      ...(await db.select().from(chatDigests)).filter((r) => r.model !== EMBED_MODEL),
      ...(await db.select().from(documentChunks)).filter((r) => r.model !== EMBED_MODEL),
    ];
    expect(stale).toHaveLength(0);
    expect(await db.select().from(characterEmbeddings)).toHaveLength(1);
    expect(await db.select().from(imageEmbeddings)).toHaveLength(1);
    expect(await db.select().from(chatSegments)).toHaveLength(1);
    expect(await db.select().from(chatDigests)).toHaveLength(1);
    expect(await db.select().from(documentChunks)).toHaveLength(1);
  });
});
