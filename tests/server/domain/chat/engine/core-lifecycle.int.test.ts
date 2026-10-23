// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/persistence/stream-events.ts
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { chatStreamEvents, messages, messageVariants } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

test("a real reasoning stream commits ordered replay rows, an unauthored assistant and its lifecycle", async () => {
  await using h = await coreHttpRoom([
    (): Response =>
      coreSse([
        coreFrame({ choices: [{ delta: { ["reasoning_content"]: "think" } }] }),
        coreFrame({ choices: [{ delta: { content: "Hi" } }] }),
        coreFrame({ choices: [{ delta: { content: " there" } }] }),
        terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
      ]),
  ]);
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, reasoning: { mode: "adaptive", enabled: true } },
      features: { detectServer: false, reasoningKeys: ["reasoning_content"] },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  const stop = new AbortController();
  subscription.defer(() => stop.abort());
  const userEvents = h.root.app.liveBuses.user.subscribeUserEvents(h.owner.userId, stop.signal)[Symbol.asyncIterator]();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", content: "Hi there", reasoning: "think", authorUserId: null }]);
  const message = outcome.messages[0];
  if (message === undefined) {
    throw new Error("the actual streamed turn committed no assistant");
  }
  const rows = await h.root.db.select().from(chatStreamEvents).where(eq(chatStreamEvents.chatId, h.chatId)).orderBy(chatStreamEvents.seq);
  expect(rows.map(({ seq, messageId, kind, delta }) => ({ seq, messageId, kind, delta }))).toEqual([
    { seq: 1, messageId: message.id, kind: "reasoning", delta: "think" },
    { seq: 2, messageId: message.id, kind: "text", delta: "Hi" },
    { seq: 3, messageId: message.id, kind: "text", delta: " there" },
  ]);
  expect(rows.every(({ id }) => id.startsWith(`${ID_PREFIX.chatStreamEvent}_`))).toBe(true);
  const generationId = rows[0]?.generationId;
  expect(generationId?.startsWith(`${ID_PREFIX.chatStreamGeneration}_`)).toBe(true);
  expect(new Set(rows.map((row) => row.generationId))).toEqual(new Set([generationId]));
  expect(await h.root.services.chat.replayStreamEvents({ principal: h.owner, chatId: h.chatId, afterSeq: 0 })).toEqual(
    rows.map(({ seq, messageId, generationId: replayGenerationId, kind, delta }) => ({ seq, messageId, generationId: replayGenerationId, kind, delta })),
  );
  expect(await h.root.db.select().from(messages).where(eq(messages.id, message.id)).get()).toMatchObject({
    role: "assistant",
    kind: "standard",
    authorUserId: null,
    seq: 1,
    initiator: "human",
    automationDepth: 0,
  });
  expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, message.selectedVariantId)).get()).toMatchObject({
    reasoning: "think",
    content: "Hi there",
  });
  const types = events.map((event) => event.type);
  for (const type of ["turnStarted", "delta", "reasoningStreamDone", "messageCommitted", "turnCompleted"] as const) {
    expect(types).toContain(type);
  }
  expect(types.indexOf("turnStarted")).toBeLessThan(types.indexOf("messageCommitted"));
  expect(types.indexOf("messageCommitted")).toBeLessThan(types.indexOf("turnCompleted"));
  expect(types.indexOf("reasoningStreamDone")).toBeLessThan(types.indexOf("turnCompleted"));
  await h.root.settleBackground();
  const end: UserBusEvent = { type: "charactersChanged" };
  h.root.app.liveBuses.user.publishUserEvent(h.owner.userId, end);
  const fanned: UserBusEvent[] = [];
  for (let next = await userEvents.next(); !next.done && next.value !== end; next = await userEvents.next()) {
    fanned.push(next.value);
  }
  expect(fanned.filter((event) => event.type === "chatsChanged")).toEqual([{ type: "chatsChanged" }]);
});
