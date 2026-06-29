import type { Db } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import { generateSegments } from "../../../../../../packages/server/src/domain/chat/memory/build/segments";
import { freshDb } from "../../../../../support/db";
import { makeChatContext, seedCharacter, seedChat, seedMessage, seedUser } from "../../_support";
import { fakeEmbeddingsStore } from "../_support";

const aria = castId<CharacterId>("character_aria");

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  const owner = await seedUser(db, "owner");
  await seedCharacter(db, owner, "aria"); // FK target for messages.characterId
});

async function seedTurns(chatId: Awaited<ReturnType<typeof seedChat>>, n: number): Promise<void> {
  for (let seq = 1; seq <= n; seq += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: ordered seed inserts in a test.
    await seedMessage(db, chatId, seq, { characterId: aria, content: `turn ${seq}` });
  }
}

describe("memory/build/segments", () => {
  test("stores a verbatim segment per complete aged-out block (lens segment + seq-span)", async () => {
    const chatId = await seedChat(db, "s");
    await seedTurns(chatId, 4);
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

  test("self-heal: a re-run over unchanged canon skips every segment", async () => {
    const chatId = await seedChat(db, "h");
    await seedTurns(chatId, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store });
    const cfg = { blockSize: 2, verbatimWindow: 0 } as const;

    await generateSegments(ctx, { chatId, config: cfg });
    const counts = await generateSegments(ctx, { chatId, config: cfg });
    expect(counts).toEqual({ written: 0, skipped: 2 });
  });

  test("mode 'off' is a no-op", async () => {
    const chatId = await seedChat(db, "o");
    await seedTurns(chatId, 4);
    const store = fakeEmbeddingsStore(db);
    const ctx = makeChatContext(db, { embeddingsStore: store.store });
    expect(await generateSegments(ctx, { chatId, config: { mode: "off" } })).toEqual({
      written: 0,
      skipped: 0,
    });
    expect(store.segments).toHaveLength(0);
  });
});
