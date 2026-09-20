import type { Db } from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import { beforeEach, describe, vi } from "vitest";
import { generateSegments } from "../../../../../../packages/server/src/domain/chat/memory/build/segments.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedUser } from "../../_support.ts";
import { fakeEmbeddingsStore, seedTurns } from "../_support.ts";

const aria = castId<CharacterId>("character_aria");

/** The pathological line of the huge-message tests: one message far past the 8192-token window the test
 *  context reports (≈200k chars ⇒ ≈5 chunks — the live corpus's worst block, a coding-helper code dump). */
const HUGE_LINE = "she watched the harbour lights blur into the rain. ";

let db: Db;
let owner: UserId;
beforeEach(async () => {
  db = await freshDb();
  owner = await seedUser(db, castId<Handle>("owner"));
  await seedCharacter(db, owner, "aria"); // FK target for messages.characterId
});

describe("memory/build/segments", () => {
  test("stores a verbatim segment per complete aged-out block (lens segment + seq-span)", async () => {
    const chatId = await seedChat(db, "s");
    await seedTurns(db, chatId, aria, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    const counts = await generateSegments(ctx, {
      chatId,
      config: { blockSize: 2, verbatimWindow: 0 },
      funderUserId: owner,
    });

    expect(counts.written).toBe(2);
    expect(store.segments.map((s) => [s.blockIdx, s.chunkIdx, s.seqStart, s.seqEnd])).toEqual([
      [0, 0, 1, 2],
      [1, 0, 3, 4],
    ]);
    const first = store.segments[0];
    expect(first).toBeDefined();
    expect(first?.lens).toBe("segment");
    expect(first?.text).toContain("turn 1");
    expect(first?.contentHash).toHaveLength(64);
  });

  // OWNER RULING (#165, ruled arm built in #172): "if we are skimping out on messages that's a no go since
  // this feeds the memory system." A block too big for the embed model is CHUNKED into in-budget pieces —
  // full fidelity, nothing truncated, nothing dropped. The corpus's real case is a coding-helper chat's
  // 200k-char code dump; the prior arm (skip-with-record) survives only past the pathological ceiling.
  test("a block over the EMBED window is CHUNKED, not skipped and not truncated — every codepoint survives (#172)", async () => {
    const chatId = await seedChat(db, "huge");
    await seedTurns(db, chatId, aria, 4);
    await seedMessage(db, chatId, 5, { characterId: aria, content: "turn 5" });
    // seq 6: ~200k chars — far past the 8192-token embed window the test context reports.
    await seedMessage(db, chatId, 6, { characterId: aria, content: HUGE_LINE.repeat(4000) });
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    const counts = await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 }, funderUserId: owner });

    expect(counts.skippedOverWindow).toBe(0); // nothing was too big to CHUNK
    // Blocks 0 + 1 are one chunk each; block 2 (the code-dump block) is several.
    const block2 = store.segments.filter((s) => s.blockIdx === 2);
    expect(block2.length).toBeGreaterThan(1);
    expect(counts.written).toBe(2 + block2.length);
    // LOSSLESS at the MESSAGE level: strip the per-chunk speaker labels (each piece RE-CARRIES the label so it
    // stays attributable) and what is left is every message body, in order, byte-for-byte. The only thing a
    // chunk boundary drops is the `\n` transcript SEPARATOR between two messages — it belongs to no message,
    // and each chunk is a standalone transcript.
    const rebuilt = block2
      .map((s) => s.text)
      .join("")
      .replaceAll(`${aria}: `, "");
    expect(rebuilt).toBe(`turn 5${HUGE_LINE.repeat(4000)}`);
    // Chunk indexes are consecutive from 0 (the storage key + the prune ceiling both assume it).
    expect(block2.map((s) => s.chunkIdx)).toEqual(block2.map((_, i) => i));
    // SPAN HONESTY: no chunk claims a seq outside the block it came from (seqs 5 and 6).
    expect(block2.every((s) => s.seqStart >= 5 && s.seqEnd <= 6)).toBe(true);
  });

  test("chunking a block preserves its neighbours byte-for-byte (a normal block is still ONE chunk)", async () => {
    const chatId = await seedChat(db, "mixed");
    await seedMessage(db, chatId, 1, { characterId: aria, content: "turn 1" });
    await seedMessage(db, chatId, 2, { characterId: aria, content: "turn 2" });
    await seedMessage(db, chatId, 3, { characterId: aria, content: "turn 3" });
    await seedMessage(db, chatId, 4, { characterId: aria, content: HUGE_LINE.repeat(4000) });
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 }, funderUserId: owner });

    const block0 = store.segments.filter((s) => s.blockIdx === 0);
    expect(block0).toHaveLength(1);
    expect(block0[0]?.chunkIdx).toBe(0);
    expect(block0[0]?.text).toContain("turn 1");
    expect(block0[0]?.text).toContain("turn 2");
  });

  test("a chunked block re-runs clean: the per-chunk hash gate skips every chunk on an unchanged pass", async () => {
    const chatId = await seedChat(db, "huge2");
    await seedMessage(db, chatId, 1, { characterId: aria, content: "turn 1" });
    await seedMessage(db, chatId, 2, { characterId: aria, content: HUGE_LINE.repeat(4000) });
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    const first = await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 }, funderUserId: owner });
    const written = store.segments.length;
    const second = await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 }, funderUserId: owner });

    expect(first.written).toBe(written);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(written); // every chunk hash matched — no re-embed of a 200k block
    expect(store.segments).toHaveLength(written); // and no duplicate rows
  });

  // The #165 arm SURVIVES for the genuinely absurd case (a block that would need more chunks than the
  // ceiling allows): skipped WHOLE, counted, logged — never truncated, never half-stored.
  test("a block past the PATHOLOGICAL ceiling is still skipped whole and RECORDED (#165's surviving arm)", async () => {
    const chatId = await seedChat(db, "absurd");
    // ~3.6M chars in ONE block ⇒ ~88 chunks at the test window, past MAX_SEGMENT_CHUNKS_PER_BLOCK (64).
    // Spread over 24 messages rather than one because a BLOCK IS A ROW SET: `segments.ts:75` returns early
    // when `cutoff < cfg.blockSize`, so with `blockSize: 24` a one-message fixture yields cutoff 1 < 24 and
    // the pass bails with zero counts before it ever reads canon — it would prove nothing, whatever the
    // message's size. (This comment previously blamed a libSQL bind limit — "silently stores an EMPTY string
    // past ~1MB". That is FALSE and was never the reason: probed on the pinned @libsql/client 0.17.4, a TEXT
    // bind round-trips byte-exact through the raw client on `file:` and `:memory:`, through `client.batch`,
    // and end-to-end through `message_variants` + `loadCanonThroughSeq` at 3M, 6.2M, 13M and 26.1M chars.
    // #179; the standing tripwire is in `tests/db/client.int.test.ts`.)
    for (let seq = 1; seq <= 24; seq += 1) {
      await seedMessage(db, chatId, seq, { characterId: aria, content: HUGE_LINE.repeat(3000) });
    }
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const spy = vi.spyOn(logger, "warn");

    const counts = await generateSegments(ctx, { chatId, config: { blockSize: 24, verbatimWindow: 0 }, funderUserId: owner });

    expect(counts.skippedOverWindow).toBe(1);
    expect(counts.written).toBe(0);
    expect(store.segments).toHaveLength(0); // NOTHING partial was stored
    expect(spy.mock.calls.at(-1)?.[0]).toMatchObject({ chatId, blockIdx: 0, embedContextTokens: 8192 });
  });

  test("self-heal: a re-run over unchanged canon skips every segment", async () => {
    const chatId = await seedChat(db, "h");
    await seedTurns(db, chatId, aria, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    const cfg = { blockSize: 2, verbatimWindow: 0 } as const;

    await generateSegments(ctx, { chatId, config: cfg, funderUserId: owner });
    const counts = await generateSegments(ctx, { chatId, config: cfg, funderUserId: owner });
    expect(counts).toEqual({ written: 0, skipped: 2, skippedOverWindow: 0 });
  });

  // THE FLOOD, at the memory seam (#172): one chat's chunks reach the write path as ONE batch, never one
  // awaited call per block. The corpus sweep's own (bigger) batch is asserted in the backfill spec.
  test("every pending chunk goes to the write path in ONE batched call", async () => {
    const chatId = await seedChat(db, "batch");
    await seedTurns(db, chatId, aria, 6);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });

    await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 }, funderUserId: owner });

    expect(store.segmentBatchSizes).toEqual([3]); // three blocks, ONE call
  });

  test("mode 'off' is a no-op", async () => {
    const chatId = await seedChat(db, "o");
    await seedTurns(db, chatId, aria, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store, embeddingsStoreSegments: store.storeSegments });
    expect(await generateSegments(ctx, { chatId, config: { mode: "off" }, funderUserId: owner })).toEqual({
      written: 0,
      skipped: 0,
      skippedOverWindow: 0,
    });
    expect(store.segments).toHaveLength(0);
  });
});
