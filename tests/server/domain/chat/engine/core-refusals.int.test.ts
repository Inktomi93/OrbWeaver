// @subject packages/server/src/domain/chat/engine/engine.ts
import "@orb/testkit/node/composed-real.ts";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatLocks, messages, messageVariants } from "@orb/db";
import { logRing } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { afterAll, vi } from "vitest";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

vi.hoisted(() => vi.stubEnv("LOG_LEVEL", "warn"));
afterAll(() => vi.unstubAllEnvs());

const REFUSAL_ROWS = [
  {
    label: "empty new slot",
    swipe: false,
    content: "",
    rawFinishReason: "tool_calls",
    detail: "answered with tool calls and no story text",
    remedy: "nothing was written",
    normalizedFinishReason: "tool",
  },
  {
    label: "empty swipe",
    swipe: true,
    content: "",
    rawFinishReason: "stop",
    detail: "returned no text",
    remedy: "nothing was written",
    normalizedFinishReason: "stop",
  },
  {
    label: "whitespace swipe",
    swipe: true,
    content: "\n\n  \n",
    rawFinishReason: "stop",
    detail: "returned no text",
    remedy: "nothing was written",
    normalizedFinishReason: "stop",
  },
  {
    label: "output-budget exhaustion",
    swipe: false,
    content: "",
    rawFinishReason: "length",
    detail: "output limit of 4096 tokens",
    remedy: "raise the preset's max output tokens",
    normalizedFinishReason: "length",
  },
] as const;

test.for(REFUSAL_ROWS)("native $label refuses without changing selected canon and explains the cause", async (row) => {
  let physicalCalls = 0;
  const prior = (): Response =>
    coreSse([coreFrame({ choices: [{ delta: { content: "The prior reply." } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]);
  const response = (): Response => {
    physicalCalls += 1;
    return coreSse([
      coreFrame({ choices: [{ delta: { content: row.content } }] }),
      terminalSseLine({ finishReason: row.rawFinishReason, usage: { promptTokens: 4, completionTokens: 3 } }),
    ]);
  };
  await using h = await coreHttpRoom(row.swipe ? [prior, response] : [response]);
  const target = row.swipe ? (await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).messages[0] : undefined;
  if (row.swipe && target === undefined) {
    throw new Error("the real swipe control committed no target");
  }
  const beforeCanon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const beforeVariants = await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx);
  const events: ChatBusEvent[] = [];
  using subscriptions = new DisposableStack();
  subscriptions.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const operation =
    target === undefined
      ? h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { maxOutputTokens: 4096 } })
      : h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: target.id });
  await expect(operation).rejects.toMatchObject({ code: "empty_generation" });
  await expect(operation).rejects.toThrow(row.detail);
  await expect(operation).rejects.toThrow(row.remedy);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(beforeCanon);
  expect(await h.root.db.select().from(messageVariants).orderBy(messageVariants.idx)).toEqual(beforeVariants);
  expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: "error" }]);
  expect(events.map((event) => event.type)).not.toContain("messageCommitted");
  expect(events.map((event) => event.type)).not.toContain("turnCompleted");
  const refusal = logRing.recent(100).filter((line) => line.includes(h.chatId) && line.includes('"event":"chat.generation.empty"'));
  expect(refusal).toHaveLength(1);
  expect(refusal[0]).toContain(`"finishReason":"${row.normalizedFinishReason}"`);
  expect(refusal[0]).toContain(`"stopReason":"${row.rawFinishReason}"`);
  expect(refusal[0]).toContain('"toolRecords":0');
  expect(events.map((event) => event.type)).not.toContain("reasoningStreamDone");
  expect(events.map((event) => event.type)).not.toContain("worldInfoActivated");
  expect(physicalCalls).toBe(1);
  expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([]);
});

test("an actual truncated swipe commits its partial prose and selects the new variant", async () => {
  await using h = await coreHttpRoom([
    (): Response =>
      coreSse([coreFrame({ choices: [{ delta: { content: "The prior reply." } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]),
    (): Response =>
      coreSse([
        coreFrame({ choices: [{ delta: { content: "The door creaks" } }] }),
        terminalSseLine({ finishReason: "length", usage: { promptTokens: 4, completionTokens: 3 } }),
      ]),
  ]);
  const events: ChatBusEvent[] = [];
  using subscriptions = new DisposableStack();
  subscriptions.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const first = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(first.aborted).toBe(false);
  const target = first.messages[0];
  if (target === undefined) {
    throw new Error("the actual truncated swipe has no prior target");
  }
  const outcome = await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: target.id });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ id: target.id, content: "The door creaks", selectedVariantIdx: 1, variantCount: 2 }]);
  expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, target.id)).orderBy(messageVariants.idx)).toMatchObject([
    { content: "The prior reply." },
    { content: "The door creaks" },
  ]);
  expect(events.filter((event) => event.type === "turnCompleted")).toHaveLength(2);
  expect(events.map((event) => event.type)).not.toContain("reasoningStreamDone");
  expect(events.map((event) => event.type)).not.toContain("worldInfoActivated");
});
