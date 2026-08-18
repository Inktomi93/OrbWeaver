import type { Db } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { castId, type Handle } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import { beforeEach, describe, vi } from "vitest";
import { generateSegments } from "../../../../../../packages/server/src/domain/chat/memory/build/segments.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedUser } from "../../_support.ts";
import { fakeEmbeddingsStore, seedTurns } from "../_support.ts";

const aria = castId<CharacterId>("character_aria");

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  const owner = await seedUser(db, castId<Handle>("owner"));
  await seedCharacter(db, owner, "aria"); // FK target for messages.characterId
});

describe("memory/build/segments", () => {
  test("stores a verbatim segment per complete aged-out block (lens segment + seq-span)", async () => {
    const chatId = await seedChat(db, "s");
    await seedTurns(db, chatId, aria, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store });

    const counts = await generateSegments(ctx, {
      chatId,
      config: { blockSize: 2, verbatimWindow: 0 },
    });

    expect(counts.written).toBe(2);
    expect(store.segments.map((s) => [s.blockIdx, s.seqStart, s.seqEnd])).toEqual([
      [0, 1, 2],
      [1, 3, 4],
    ]);
    const first = store.segments[0];
    expect(first).toBeDefined();
    expect(first?.lens).toBe("segment");
    expect(first?.text).toContain("turn 1");
    expect(first?.contentHash).toHaveLength(64);
  });

  // OWNER RULING (#165): "if we are skimping out on messages that's a no go since this feeds the memory
  // system." A block too big for the embed model is skipped WHOLE and recorded — a truncated vector would
  // claim a seq-span it never read, silently losing the tail of memory-feeding content. The corpus's real
  // pathological case is a coding-helper chat's 200k-char code dump.
  test("a block over the EMBED window is skipped whole and RECORDED — never truncated into a vector (#165)", async () => {
    const chatId = await seedChat(db, "huge");
    await seedTurns(db, chatId, aria, 4);
    await seedMessage(db, chatId, 5, { characterId: aria, content: "turn 5" });
    // seq 6: ~200k chars — far past the 8192-token embed window the test context reports.
    await seedMessage(db, chatId, 6, { characterId: aria, content: "she watched the harbour lights blur into the rain. ".repeat(4000) });
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store });
    const spy = vi.spyOn(logger, "warn");

    const counts = await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 } });

    // Blocks 0 + 1 build; block 2 (the code-dump block) is skipped WHOLE — no partial vector for it.
    expect(counts.written).toBe(2);
    expect(counts.skippedOverWindow).toBe(1);
    expect(store.segments.map((s) => s.blockIdx)).toEqual([0, 1]);
    // NOTHING truncated: no stored segment carries a clipped body of the huge block.
    expect(store.segments.every((s) => !s.text.includes("harbour lights"))).toBe(true);
    // …and the gap is a STATED fact, not a silent hole.
    expect(spy.mock.calls.at(-1)?.[0]).toMatchObject({ chatId, blockIdx: 2, embedContextTokens: 8192 });
  });

  test("an over-window block stays UNSTORED, so the next pass re-offers it (the self-heal keeps the door open)", async () => {
    const chatId = await seedChat(db, "huge2");
    await seedMessage(db, chatId, 1, { characterId: aria, content: "turn 1" });
    await seedMessage(db, chatId, 2, { characterId: aria, content: "x".repeat(200_000) });
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store });

    const first = await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 } });
    const second = await generateSegments(ctx, { chatId, config: { blockSize: 2, verbatimWindow: 0 } });

    // Not stored ⇒ not hash-skipped next pass: it is re-offered every run (it builds the day it fits).
    expect(first.skippedOverWindow).toBe(1);
    expect(second.skippedOverWindow).toBe(1);
    expect(second.skipped).toBe(0);
    expect(store.segments).toHaveLength(0);
  });

  test("self-heal: a re-run over unchanged canon skips every segment", async () => {
    const chatId = await seedChat(db, "h");
    await seedTurns(db, chatId, aria, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store });
    const cfg = { blockSize: 2, verbatimWindow: 0 } as const;

    await generateSegments(ctx, { chatId, config: cfg });
    const counts = await generateSegments(ctx, { chatId, config: cfg });
    expect(counts).toEqual({ written: 0, skipped: 2, skippedOverWindow: 0 });
  });

  test("mode 'off' is a no-op", async () => {
    const chatId = await seedChat(db, "o");
    await seedTurns(db, chatId, aria, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store });
    expect(await generateSegments(ctx, { chatId, config: { mode: "off" } })).toEqual({
      written: 0,
      skipped: 0,
      skippedOverWindow: 0,
    });
    expect(store.segments).toHaveLength(0);
  });
});
