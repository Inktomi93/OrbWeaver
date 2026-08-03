// verb: purgeMemoryVectors — PD-139(b), the chat-memory arm of the PD-104 old-space reclaim. Load-bearing
// assertions (mirroring embed-corpus.int's purge tests): the verb deletes the `chat_segments`/`chat_digests`
// rows stranded in an OLD embed `(model)` space, keeps ONLY the active-space rows (`roleClients.embedModel`),
// and reports the reclaimed counts per table. The BULK-ONLY + skip-on-abort guard lives in the runner
// (memory-backfill.test.ts), so this verb-level test drives the DELETE half directly.

import { chatDigests, chatSegments } from "@orb/db";
import type { ChatDigestId, ChatSegmentId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import { upsertChatDigest, upsertChatSegment } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { EMBED_DIM, EMBED_MODEL, fakeVector, makeStoreHarness, seedCharacter, seedChat, seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;
const STALE_MODEL = "old-embed-model-v0";

describe("purgeMemoryVectors — PD-139(b) chat-memory old-space reclaim", () => {
  test("purges the stranded old-model segment + digest rows, keeping only the active space", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db);
    // One OLD-space + one active-space row in each model-keyed chat-memory table (both coexist because the
    // upsert key now includes `model` — PD-104).
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_old"),
      chatId,
      blockIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "block",
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h1",
      model: STALE_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_new"),
      chatId,
      blockIdx: 0,
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
      model: STALE_MODEL,
      dim: EMBED_DIM,
      now: NOW,
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
    });
    // The harness's roleClients.embedModel is EMBED_MODEL — the active space the purge scopes against.
    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);

    const purged = await svc.purgeMemoryVectors();

    expect(purged).toEqual({ segments: 1, digests: 1 });
    expect((await db.select().from(chatSegments)).map((r) => r.model)).toEqual([EMBED_MODEL]);
    expect((await db.select().from(chatDigests)).map((r) => r.model)).toEqual([EMBED_MODEL]);
  });

  test("is a no-op when every row is already in the active space", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db);
    await upsertChatSegment(db, {
      id: castId<ChatSegmentId>("chat_segment_active"),
      chatId,
      blockIdx: 0,
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
      dim: EMBED_DIM,
      now: NOW,
    });
    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);

    const purged = await svc.purgeMemoryVectors();

    expect(purged).toEqual({ segments: 0, digests: 0 });
    expect(await db.select().from(chatSegments)).toHaveLength(1);
    expect(await db.select().from(chatDigests)).toHaveLength(1);
  });
});
