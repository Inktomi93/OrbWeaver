// verb: pruneMemoryBlocks — the chat-memory SHRINK seam (stickler 2026-08-08 canon-message-identity, leg-2
// refutation). Distinct from `purgeMemoryVectors`, which reclaims a retired embed SPACE: this reclaims blocks
// that CANON dropped. Memory slices blocks by POSITION and stores them keyed `(tier, blockIdx)`, while its
// self-heal is CONTENT-HASH keyed — so the heal can only ever re-summarize a block that still EXISTS. When
// the ingest set shrinks (a host hides a trailing span), the trailing block stops being produced, no
// surviving hash changes, and before this verb nothing deleted the orphan: the digest summarized verbatim
// FROM the removed rows stayed recallable through `{{memory}}`.
//
// Load-bearing assertions: the ceiling is per-tier (so the consolidation CASCADE lands in the same DELETE),
// the scope bucket is respected (a sibling bucket's blocks are never collateral), survivors are untouched,
// an ordinary no-shrink pass deletes NOTHING (the build calls this every pass), and the digest's
// `chat_digest_speakers` join rows go with it.

import { chatDigestSpeakers, chatDigests, chatSegments } from "@orb/db";
import type { ChatDigestId, ChatSegmentId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { upsertChatDigest, upsertChatSegment } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, makeStoreHarness, seedCharacter, seedChat, seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

describe("pruneMemoryBlocks — the chat-memory shrink reclaim", () => {
  test("digests: deletes every block beyond its TIER's ceiling (the consolidation cascade lands in the same DELETE)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scopedCharacterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db);
    // Tier 0 blocks 0..3 + the two tier-1 consolidations that folded them (fanOut 2).
    for (const [tier, blockIdx] of [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed inserts in a test.
      await upsertChatDigest(db, {
        id: castId<ChatDigestId>(`chat_digest_${tier}_${blockIdx}`),
        chatId,
        scopedCharacterId,
        isGroup: false,
        tier,
        blockIdx,
        text: `digest ${tier}.${blockIdx}`,
        topicAnchor: `[a${tier}${blockIdx}]`,
        keywords: [],
        embedding: fakeVector(EMBED_DIM, 1),
        contentHash: `h${tier}${blockIdx}`,
        model: EMBED_MODEL,
        dim: EMBED_DIM,
        now: NOW,
      });
    }

    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    // Canon shrank from 4 blocks to 3 ⇒ tier-0 keeps 0..2; tier 1 keeps floor(3/2) = 1 parent, so the parent
    // that folded the vanished block 3 goes too — the upward cascade, expressed purely as ceilings.
    const result = await svc.pruneMemoryBlocks({ lens: "digest", chatId, scopedCharacterId, keepPerTier: [3, 1, 0] });

    expect(result.rowsDeleted).toBe(2);
    const left = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
    expect(left.map((d) => `${d.tier}:${d.blockIdx}`).sort()).toEqual(["0:0", "0:1", "0:2", "1:0"]);
  });

  test("digests: a no-shrink pass deletes NOTHING (the build calls this on every pass)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scopedCharacterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db);
    await upsertChatDigest(db, {
      id: castId<ChatDigestId>("chat_digest_keep"),
      chatId,
      scopedCharacterId,
      isGroup: false,
      tier: 0,
      blockIdx: 0,
      text: "kept",
      topicAnchor: "[k]",
      keywords: [],
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "hk",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });

    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    const result = await svc.pruneMemoryBlocks({ lens: "digest", chatId, scopedCharacterId, keepPerTier: [1, 0, 0] });

    expect(result.rowsDeleted).toBe(0);
    expect(await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId))).toHaveLength(1);
  });

  test("digests: the prune is SCOPE-keyed — a sibling bucket's blocks are never collateral", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const mine = await seedCharacter(db, owner, { id: "character_mine", name: "mine" });
    const theirs = await seedCharacter(db, owner, { id: "character_theirs", name: "theirs" });
    const chatId = await seedChat(db);
    // Witnessing means two buckets legitimately hold DIFFERENT block sets, so a shrink in one says nothing
    // about the other — pruning globally would silently delete a valid digest every single pass.
    for (const scopedCharacterId of [mine, theirs]) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed inserts in a test.
      await upsertChatDigest(db, {
        id: castId<ChatDigestId>(`chat_digest_${scopedCharacterId}`),
        chatId,
        scopedCharacterId,
        isGroup: true,
        tier: 0,
        blockIdx: 5,
        text: "block five",
        topicAnchor: "[b5]",
        keywords: [],
        embedding: fakeVector(EMBED_DIM, 1),
        contentHash: "h5",
        model: EMBED_MODEL,
        dim: EMBED_DIM,
        now: NOW,
      });
    }

    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    const result = await svc.pruneMemoryBlocks({ lens: "digest", chatId, scopedCharacterId: mine, keepPerTier: [1, 0] });

    expect(result.rowsDeleted).toBe(1);
    const left = await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
    expect(left.map((d) => d.scopedCharacterId)).toEqual([theirs]);
  });

  test("digests: the pruned rows take their chat_digest_speakers join rows with them (no orphan joins)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scopedCharacterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db);
    const digestId = castId<ChatDigestId>("chat_digest_with_speakers");
    await upsertChatDigest(db, {
      id: digestId,
      chatId,
      scopedCharacterId,
      isGroup: true,
      tier: 0,
      blockIdx: 0,
      text: "spoken",
      topicAnchor: "[s]",
      keywords: [],
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "hs",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    await db.insert(chatDigestSpeakers).values({ digestId, characterId: scopedCharacterId });

    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    await svc.pruneMemoryBlocks({ lens: "digest", chatId, scopedCharacterId, keepPerTier: [0] });

    expect(await db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId))).toHaveLength(0);
    expect(await db.select().from(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, digestId))).toHaveLength(0);
  });

  test("segments: ONE flat ceiling, chat-wide — a stale seq-span never outlives its block", async () => {
    const db = await freshDb();
    await seedUser(db, { handle: castId<Handle>("owner") });
    const chatId = await seedChat(db);
    for (const blockIdx of [0, 1, 2]) {
      // biome-ignore lint/performance/noAwaitInLoops: ordered seed inserts in a test.
      await upsertChatSegment(db, {
        id: castId<ChatSegmentId>(`chat_segment_${blockIdx}`),
        chatId,
        blockIdx,
        seqStart: blockIdx * 2,
        seqEnd: blockIdx * 2 + 1,
        text: `block ${blockIdx}`,
        embedding: fakeVector(EMBED_DIM, 1),
        contentHash: `hs${blockIdx}`,
        model: EMBED_MODEL,
        dim: EMBED_DIM,
        now: NOW,
      });
    }

    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    // A stale segment is worse than dead weight: recall resolves a digest hit's witnessing through its
    // `(seqStart, seqEnd)` span, so a span pointing at rows that are no longer ingested mis-maps a live hit.
    const result = await svc.pruneMemoryBlocks({ lens: "segment", chatId, keepBlockCount: 1 });

    expect(result.rowsDeleted).toBe(2);
    const left = await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId));
    expect(left.map((s) => s.blockIdx)).toEqual([0]);
  });
});
