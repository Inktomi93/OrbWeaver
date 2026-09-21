// verb: storeSegments — the VERBATIM-segment write path, a BATCH (#172). Load-bearing assertions:
//   • the precomputed content_hash gates per CHUNK — an unchanged chunk is a `noop` (no re-embed, no row);
//   • the whole batch embeds in ONE call (the flood: the owner batching ruling's observable consequence —
//     "batch by phase, toss it all at vLLM"; a per-item loop would show N calls);
//   • N chunks of ONE block coexist as N rows, each with its own seq-span (the chunking arm's storage half);
//   • results are index-aligned to the input, so a caller can tell a write from a noop per item;
//   • the SPACE TRIPWIRE + `EmbedFailedError` still bite (a batch is not a hole in the store's guarantees);
//   • `hub_score` is never touched.

import { chatSegments } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { EmbeddingsService } from "@orb/server/domain/embeddings";
import { createEmbeddingsService, EmbedFailedError, SpaceMismatchError } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, makeStoreHarness, seedChat, seedUser } from "../_support.ts";

const SEGMENT_TEXT = "Alice: meet me at the docks.\nBob: I'll bring the relic.";

/** The batch's owner. SEEDED per test, never a bare literal: `storeSegments` mints this owner's
 *  `embed_generations` row, whose `owner_id` FKs `users` and whose `connection_id` FKs the harness's vector
 *  connection — `seedUser` (embeddings `_support`) lands both parents. */
const OWNER = castId<UserId>("user_owner");

/** The batch op's item shape, derived from the service signature (the params type is domain-internal). */
type SegmentStoreParams = Parameters<EmbeddingsService["storeSegments"]>[0][number];

function segment(chatId: SegmentStoreParams["chatId"], over: Partial<SegmentStoreParams> = {}): SegmentStoreParams {
  return {
    kind: "chat-block",
    lens: "segment",
    ownerId: OWNER,
    chatId,
    blockIdx: 0,
    chunkIdx: 0,
    seqStart: 1,
    seqEnd: 8,
    text: SEGMENT_TEXT,
    contentHash: "seg-h",
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    ...over,
  };
}

describe("storeSegments — the batched verbatim lens", () => {
  test("persists the verbatim text + seq-span; the PRECOMPUTED contentHash rides through (no recompute)", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    await seedUser(db, { id: OWNER });
    const chatId = await seedChat(db);

    const [result] = await svc.storeSegments([segment(chatId, { blockIdx: 3, seqStart: 24, seqEnd: 31, contentHash: "precomputed-seg-hash" })]);

    expect(result?.outcome).toBe("written");
    expect(result?.contentHash).toBe("precomputed-seg-hash");
    expect(h.roleClients.embed).toHaveBeenCalledWith([SEGMENT_TEXT]);
    const rows = await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text).toBe(SEGMENT_TEXT);
    expect(rows[0]?.blockIdx).toBe(3);
    expect(rows[0]?.chunkIdx).toBe(0);
    expect(rows[0]?.seqStart).toBe(24);
    expect(rows[0]?.seqEnd).toBe(31);
    expect(rows[0]?.hubScore).toBeNull();
  });

  test("an unchanged chunk hash is a noop — no re-embed, no second row", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    await seedUser(db, { id: OWNER });
    const chatId = await seedChat(db);
    const params = [segment(chatId)];

    expect((await svc.storeSegments(params))[0]?.outcome).toBe("written");
    expect((await svc.storeSegments(params))[0]?.outcome).toBe("noop");
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);
    expect(await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId))).toHaveLength(1);
  });

  // THE FLOOD (#172, owner batching ruling). The whole batch is ONE embed call — not one per item, not
  // client-side chunks. That is the entire point of the batch verb: vLLM's continuous batcher owns the
  // concurrency, and a client-side round-robin is what kept it starved.
  test("the WHOLE batch embeds in ONE call, and every chunk lands with its own row", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    await seedUser(db, { id: OWNER });
    const chatId = await seedChat(db);

    const results = await svc.storeSegments([
      segment(chatId, { blockIdx: 0, chunkIdx: 0, seqStart: 1, seqEnd: 4, text: "part one", contentHash: "c0" }),
      segment(chatId, { blockIdx: 0, chunkIdx: 1, seqStart: 5, seqEnd: 8, text: "part two", contentHash: "c1" }),
      segment(chatId, { blockIdx: 1, chunkIdx: 0, seqStart: 9, seqEnd: 12, text: "next block", contentHash: "c2" }),
    ]);

    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);
    expect(h.roleClients.embed).toHaveBeenCalledWith(["part one", "part two", "next block"]);
    expect(results.map((r) => r.outcome)).toEqual(["written", "written", "written"]);
    const rows = await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId));
    // TWO chunks of block 0 coexist — the storage half of "chunk it, never truncate it".
    expect(rows.map((r) => `${r.blockIdx}:${r.chunkIdx}`).sort()).toEqual(["0:0", "0:1", "1:0"]);
    expect(rows.find((r) => r.chunkIdx === 1)?.seqStart).toBe(5);
  });

  test("results are index-aligned: a mixed batch reports noop and written per ITEM, and embeds only the changed ones", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    await seedUser(db, { id: OWNER });
    const chatId = await seedChat(db);
    const settled = segment(chatId, { blockIdx: 0, contentHash: "settled" });
    await svc.storeSegments([settled]);
    h.roleClients.embed.mockClear();

    const results = await svc.storeSegments([settled, segment(chatId, { blockIdx: 1, text: "fresh", contentHash: "fresh-h" })]);

    expect(results.map((r) => r.outcome)).toEqual(["noop", "written"]);
    expect(h.roleClients.embed).toHaveBeenCalledWith(["fresh"]); // the settled chunk never reached the engine
  });

  test("an empty batch is a no-op: no embed, no rows, no results", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);

    expect(await svc.storeSegments([])).toEqual([]);
    expect(h.roleClients.embed).not.toHaveBeenCalled();
  });

  test("the SPACE TRIPWIRE still bites inside a batch — a wrong-dim vector throws and lands no row", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    await seedUser(db, { id: OWNER });
    const chatId = await seedChat(db);
    h.roleClients.embed.mockResolvedValueOnce({
      vectors: [fakeVector(EMBED_DIM + 1, 1)],
      model: EMBED_MODEL,
      usage: { promptTokens: null, totalTokens: null },
    });

    await expect(svc.storeSegments([segment(chatId)])).rejects.toThrow(SpaceMismatchError);
    expect(await db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId))).toHaveLength(0);
  });

  test("a filtered (null) vector inside a batch throws EmbedFailedError", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    await seedUser(db, { id: OWNER });
    const chatId = await seedChat(db);
    h.roleClients.embed.mockResolvedValueOnce({ vectors: [null], model: EMBED_MODEL, usage: { promptTokens: null, totalTokens: null } });

    await expect(svc.storeSegments([segment(chatId)])).rejects.toThrow(EmbedFailedError);
  });
});
