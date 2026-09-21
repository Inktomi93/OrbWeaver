// verb: purgeMemoryVectors — memory completion records a generation receipt. Retired generations remain
// readable until cards, memory, and documents have all completed the same pending generation; promotion
// then performs the old-space reclaim atomically.

import type { Db } from "@orb/db";
import { chatDigests, chatSegments, embedGenerations } from "@orb/db";
import type { ChatDigestId, ChatSegmentId, EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import type { PinnedGeneration } from "../../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { upsertChatDigest, upsertChatSegment } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { resolveTargetGeneration } from "../../../../../packages/server/src/domain/embeddings/substrate/generation.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { StoreHarness } from "../_support.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, makeStoreHarness, seedCharacter, seedChat, seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;
const STALE_MODEL = "old-embed-model-v0";

async function seedHarnessGeneration(ownerId: UserId, harness: StoreHarness): Promise<PinnedGeneration> {
  const resolved = await harness.roleClients.resolved("embed");
  if (resolved === null) {
    throw new Error("the memory fixture needs an embed connection");
  }
  // The `user_connections` row `resolved.connectionId` points at is seeded by `seedUser` (embeddings
  // `_support` → `seedVectorConnection`) — the generation's `connection_id` FK parent has ONE home.
  const generation = await resolveTargetGeneration(harness.ctx, ownerId, "embed");
  if (generation === null) {
    throw new Error("expected generation");
  }
  return generation;
}

async function seedDetachedGeneration(db: Db, ownerId: UserId, model: string): Promise<EmbedGenerationId> {
  const id = castId<EmbedGenerationId>(`embed_generation_${ownerId}_${model}`);
  await db
    .insert(embedGenerations)
    .values({
      id,
      ownerId,
      task: "embed",
      via: "embed",
      connectionId: null,
      connectionRef: castId<UserConnectionId>(`fixture:${model}`),
      fingerprint: `fixture:${model}`,
      space: model,
      createdAt: NOW,
    })
    .onConflictDoNothing();
  return id;
}

describe("purgeMemoryVectors — PD-139(b) chat-memory old-space reclaim", () => {
  test("retains both memory generations until cards and documents complete", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db, "chat_test", owner);
    const harness = makeStoreHarness(db);
    const generation = await seedHarnessGeneration(owner, harness);
    const staleGenerationId = await seedDetachedGeneration(db, owner, STALE_MODEL);
    // One OLD-space + one active-space row in each model-keyed chat-memory table (both coexist because the
    // upsert key now includes `model` — PD-104).
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
      model: STALE_MODEL,
      generationId: staleGenerationId,
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
      generationId: generation.id,
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
      model: STALE_MODEL,
      generationId: staleGenerationId,
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
      generationId: generation.id,
      dim: EMBED_DIM,
      now: NOW,
      speakerCharacterIds: [],
    });
    // The harness's roleClients.embedModel is EMBED_MODEL — the active space the purge scopes against.
    const svc = createEmbeddingsService(harness.ctx);
    const purged = await svc.purgeMemoryVectors({ ownerId: owner, generation });

    expect(purged).toEqual({ segments: 0, digests: 0 });
    expect((await db.select().from(chatSegments)).map((r) => r.model).sort()).toEqual([EMBED_MODEL, STALE_MODEL].sort());
    expect((await db.select().from(chatDigests)).map((r) => r.model).sort()).toEqual([EMBED_MODEL, STALE_MODEL].sort());
  });

  test("refuses a stale completion receipt without deleting either space", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db, "chat_test", owner);
    const harness = makeStoreHarness(db);
    const generation = await seedHarnessGeneration(owner, harness);
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_active"),
      chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "block",
      embedding: fakeVector(EMBED_DIM, 2),
      contentHash: "h2",
      model: EMBED_MODEL,
      generationId: generation.id,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertChatDigest(db, {
      id: castId<ChatDigestId>("chat_digest_active"),
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
      generationId: generation.id,
      dim: EMBED_DIM,
      now: NOW,
      speakerCharacterIds: [],
    });
    const svc = createEmbeddingsService(harness.ctx);
    await expect(svc.purgeMemoryVectors({ ownerId: owner, generation: { ...generation, id: castId<EmbedGenerationId>("stale-generation") } })).resolves.toEqual(
      {
        segments: 0,
        digests: 0,
      },
    );
    expect(await db.select().from(chatSegments)).toHaveLength(1);
    expect(await db.select().from(chatDigests)).toHaveLength(1);
  });
});
