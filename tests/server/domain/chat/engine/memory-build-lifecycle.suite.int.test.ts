// @subject packages/server/src/domain/chat/engine/engine.ts
// Physical SQLite refusals exercise the real memory supervisor and total durable warning emitter.
import "@orb/testkit/node/composed-real.ts";
import process from "node:process";
import type { TurnOutcome } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { chatDigests, chatEvents, chatSegments, messages } from "@orb/db";
import { logRing } from "@orb/server/foundation/observability";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq, sql } from "drizzle-orm";
import { vi } from "vitest";

const ids = createSeededIds();
const LOG_SCAN_LIMIT = 100;

interface MemoryTurnCapture {
  readonly outcome: TurnOutcome;
  readonly canon: readonly (typeof messages.$inferSelect)[];
}

async function room(): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly turn: () => Promise<MemoryTurnCapture>;
    readonly warnings: () => Promise<(typeof chatEvents.$inferSelect)[]>;
  }
> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) =>
      body.includes("Transcript block:") ? "The remembered turn\nThe keeper remembers this conversation.\nKeywords: keeper" : "The real memory turn commits.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      providerFetch: physical.execute,
      server: { ids, logLevel: "warn" },
      memoryEnabled: true,
      group: { output: "per-speaker", policy: "list" },
      memoryDefaults: { mode: "mixC", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
    }),
  );
  const chatBinding = (await h.root.services.connection.listBindings({ principal: h.owner })).find(({ task }) => task === "chat")?.binding;
  if (chatBinding === undefined || chatBinding === null || chatBinding.connectionId === null) {
    throw new Error("the real memory room has no saved chat binding");
  }
  await h.root.services.connection.update({
    principal: h.owner,
    connectionId: chatBinding.connectionId,
    patch: { promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false } },
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the real memory room has no seated character");
  }
  for (let seq = 1; seq <= 3; seq += 1) {
    await seedMessage(h.root.db, { chatId: h.chatId, seq, characterId: character.id, content: `The keeper's historical memory ${seq}.` }, h.root.idSource);
  }
  const turn = async (): Promise<MemoryTurnCapture> => {
    const outcome = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
    await h.root.settleBackground();
    const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId));
    return { outcome, canon };
  };
  const warnings = async (): Promise<(typeof chatEvents.$inferSelect)[]> =>
    (await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId))).filter(({ payload }) => payload.type === "warning");
  const lifetime = construction.move();
  return { h, turn, warnings, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("the memory build throwing emits warning(memory_build_failed) but the turn itself still completes", async () => {
  await using fixture = await room();
  await fixture.h.root.db.run(
    sql`CREATE TEMP TRIGGER refuse_memory_segment BEFORE INSERT ON ${chatSegments} BEGIN SELECT RAISE(ABORT, 'controlled memory segment refusal'); END`,
  );
  const { outcome, canon } = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: "The real memory turn commits." }]);
  expect(canon).toHaveLength(4);
  expect(canon.map(({ id }) => id)).toContain(outcome.messages[0]?.id);
  expect((await fixture.warnings()).map(({ payload }) => payload)).toMatchObject([{ type: "warning", chatId: fixture.h.chatId, code: "memory_build_failed" }]);
  expect(logRing.recent(LOG_SCAN_LIMIT).filter((line) => line.includes(fixture.h.chatId) && line.includes("memory: post-turn build failed"))).toHaveLength(1);
});

test("a failing warning append neither fails the turn nor leaves an unhandled rejection", async () => {
  await using fixture = await room();
  await fixture.h.root.db.run(
    sql`CREATE TEMP TRIGGER refuse_memory_segment BEFORE INSERT ON ${chatSegments} BEGIN SELECT RAISE(ABORT, 'controlled memory segment refusal'); END`,
  );
  await fixture.h.root.db.run(
    sql`CREATE TEMP TRIGGER refuse_memory_warning BEFORE INSERT ON ${chatEvents} WHEN NEW."type" = 'warning' AND json_extract(NEW."payload", '$.code') = 'memory_build_failed' BEGIN SELECT RAISE(ABORT, 'controlled memory warning append refusal'); END`,
  );
  const unhandled = vi.fn();
  process.on("unhandledRejection", unhandled);
  try {
    const { outcome, canon } = await fixture.turn();
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toMatchObject([{ role: "assistant", content: "The real memory turn commits." }]);
    expect(canon).toHaveLength(4);
    expect(canon.map(({ id }) => id)).toContain(outcome.messages[0]?.id);
    expect(await fixture.warnings()).toEqual([]);
    const logged = logRing.recent(LOG_SCAN_LIMIT).filter((line) => line.includes(fixture.h.chatId));
    expect(logged.filter((line) => line.includes("memory: post-turn build failed"))).toHaveLength(1);
    expect(logged.filter((line) => line.includes("durable append failed on a live chat — retrying"))).toHaveLength(1);
    expect(logged.filter((line) => line.includes("DURABLE APPEND FAILED on a live chat — event dropped, its replay slot is permanently missing"))).toHaveLength(
      1,
    );
    expect(unhandled.mock.calls).toEqual([]);
  } finally {
    process.off("unhandledRejection", unhandled);
  }
});

test("with no summarize connection the segments build, digests are skipped, and no failure notice is raised", async () => {
  await using fixture = await room();
  await fixture.h.caller.connection.setBinding({ task: "summarize", connectionId: null });
  const { outcome, canon } = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: "The real memory turn commits." }]);
  expect(canon).toHaveLength(4);
  expect(canon.map(({ id }) => id)).toContain(outcome.messages[0]?.id);
  expect((await fixture.h.root.db.select().from(chatSegments).where(eq(chatSegments.chatId, fixture.h.chatId))).length).toBeGreaterThan(0);
  expect(await fixture.h.root.db.select().from(chatDigests).where(eq(chatDigests.chatId, fixture.h.chatId))).toEqual([]);
  expect(await fixture.warnings()).toEqual([]);
});

test("the memory build succeeding never emits warning(memory_build_failed)", async () => {
  await using fixture = await room();
  const { outcome, canon } = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: "The real memory turn commits." }]);
  expect(canon).toHaveLength(4);
  expect(canon.map(({ id }) => id)).toContain(outcome.messages[0]?.id);
  expect((await fixture.h.root.db.select().from(chatSegments).where(eq(chatSegments.chatId, fixture.h.chatId))).length).toBeGreaterThan(0);
  expect((await fixture.h.root.db.select().from(chatDigests).where(eq(chatDigests.chatId, fixture.h.chatId))).length).toBeGreaterThan(0);
  expect(await fixture.warnings()).toEqual([]);
});
