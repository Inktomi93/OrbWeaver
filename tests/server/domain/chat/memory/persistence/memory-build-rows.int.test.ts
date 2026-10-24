// A post-turn memory build writes its vector rows: segments always, digests only with a summarize
// connection. The rows are memory storage no read verb exposes.
// @subject packages/server/src/domain/chat/engine/engine.ts

import { chatDigests, chatSegments } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { room } from "../../engine/memory-build.fixtures.ts";

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
