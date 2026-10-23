// @subject packages/server/src/domain/chat/engine/engine.ts
// Accepted public turns must close their slot when a real lease or target disappears before start.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatLocks, closeDb, messages } from "@orb/db";
import { CHAT_OP_CODES, ChatNotFoundError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { HeldStatement } from "@orb/testkit/node/composed";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const PEER_LEASE_MS = 60_000;

function reply(): Response {
  return coreSse([
    coreFrame({ choices: [{ delta: { content: "The actual retained reply." } }] }),
    terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
  ]);
}

test("an accepted swipe closes exactly once on a real held lease while public lock-free generation still commits", async () => {
  await using h = await coreHttpRoom([reply, reply]);
  const target = (await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).messages[0];
  if (target === undefined) {
    throw new Error("the actual locked-swipe control committed no target");
  }
  const lease = { chatId: h.chatId, holder: "controlled-peer-holder", acquiredAt: h.root.clock.now(), expiresAt: h.root.clock.now() + PEER_LEASE_MS };
  await h.root.db.insert(chatLocks).values(lease);
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  await expect(h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: target.id })).rejects.toMatchObject({
    code: CHAT_OP_CODES.locked,
  });
  expect(events.map((event) => event.type)).toEqual(["turnAccepted", "turnAborted"]);
  expect(events[1]).toMatchObject({ reason: "error", intent: "swipe", automationDepth: 0 });
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toHaveLength(1);
  const generated = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(generated.aborted).toBe(false);
  expect(generated.messages).toMatchObject([{ seq: 2, content: "The actual retained reply." }]);
  expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([lease]);
  expect(h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(2);
});

test("a real post-accept target deletion closes the swipe slot with not-found before any turn starts", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const h = ownership.use(await coreHttpRoom([reply], { server: { db: held.db } }));
  const target = (await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).messages[0];
  if (target === undefined) {
    throw new Error("the actual target-deletion race committed no initial reply");
  }
  const events: ChatBusEvent[] = [];
  const accepted = Promise.withResolvers<HeldStatement>();
  let gate: HeldStatement | undefined;
  ownership.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      events.push(event);
      if (event.type === "turnAccepted" && event.intent === "swipe") {
        gate = held.hold(/^select .* from "messages" inner join "message_variants" .* where .*"messages"\."id" =/u);
        accepted.resolve(gate);
      }
    }),
  );
  const running = h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: target.id });
  const settled = Promise.allSettled([running]);
  const premature = running.then(() => {
    throw new Error("the actual target-deletion swipe settled before its held target load");
  });
  try {
    const boundary = await Promise.race([accepted.promise, premature]);
    await Promise.race([boundary.reached, premature]);
    boundary.disarm();
    await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: [target.id] });
    expect(await h.root.db.select().from(messages).where(eq(messages.id, target.id))).toEqual([]);
    boundary.release();
    await expect(running).rejects.toBeInstanceOf(ChatNotFoundError);
    const lifecycle = events.filter(
      (event) => event.type === "turnAccepted" || event.type === "turnStarted" || event.type === "turnAborted" || event.type === "turnCompleted",
    );
    expect(lifecycle.map((event) => event.type)).toEqual(["turnAccepted", "turnAborted"]);
    expect(lifecycle[1]).toMatchObject({ reason: "error", intent: "swipe", automationDepth: 0 });
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([]);
    expect(h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
  } finally {
    gate?.release();
    await settled;
  }
});
