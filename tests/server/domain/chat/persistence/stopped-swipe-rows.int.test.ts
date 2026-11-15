// A public swipe stopped after real partial tokens keeps them as a new stopped variant while the slot's earlier
// variants and the room's other canon rows stay byte-for-byte; a lock lost after the same tokens keeps nothing.
// @subject packages/server/src/domain/chat/engine/engine.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatLocks, messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { seedPeerLeaseRows } from "@orb/testkit/node/rows";
import { eq, ne } from "drizzle-orm";
import { coreFrame, coreHttpRoom, corePartialReply, coreSse } from "../engine/core-physical.ts";

const PARTIAL = "The new reply is not finished";

function priorReply(): Response {
  return coreSse([
    coreFrame({ choices: [{ delta: { content: "The selected prior prose." } }] }),
    terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
  ]);
}

/** Generate the slot a swipe then stops, and start that swipe with its partial tokens on the room's bus. */
async function swipeUntilPartial(h: ChatRoot): Promise<{
  readonly target: { readonly id: Parameters<ChatRoot["root"]["services"]["chat"]["swipe"]>[0]["messageId"] };
  readonly running: ReturnType<ChatRoot["root"]["services"]["chat"]["swipe"]>;
  readonly events: ChatBusEvent[];
  readonly [Symbol.dispose]: () => void;
}> {
  const target = (await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).messages[0];
  if (target === undefined) {
    throw new Error("the actual stopped swipe has no selected target");
  }
  const events: ChatBusEvent[] = [];
  const partial = Promise.withResolvers<void>();
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId !== h.chatId) {
      return;
    }
    events.push(event);
    if (event.type === "delta" && event.delta.kind === "text" && event.delta.text === PARTIAL) {
      partial.resolve();
    }
  });
  const running = h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: target.id });
  await Promise.race([
    partial.promise,
    running.then(() => {
      throw new Error("the real swipe settled before its partial token observation");
    }),
  ]);
  return { target, running, events, [Symbol.dispose]: unsubscribe };
}

test("a public swipe stopped after actual partial tokens keeps them as a new variant and leaves every prior row byte-for-byte", async () => {
  const stopped = corePartialReply([coreFrame({ choices: [{ delta: { content: PARTIAL } }] })]);
  await using h = await coreHttpRoom([priorReply, stopped.respond]);
  using swipe = await swipeUntilPartial(h);
  const settled = Promise.allSettled([swipe.running]);
  try {
    const before = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, swipe.target.id)).orderBy(messageVariants.idx);
    const otherCanon = await h.root.db.select().from(messages).where(ne(messages.id, swipe.target.id));
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    expect(await swipe.running).toMatchObject({ aborted: true, abortReason: "user", messages: [{ id: swipe.target.id, content: PARTIAL }] });
    await stopped.closed;
    const after = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, swipe.target.id)).orderBy(messageVariants.idx);
    // The earlier variant is untouched; the kept text is one new selected variant, marked stopped.
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.slice(before.length)).toMatchObject([{ content: PARTIAL, terminalReason: "user", finishReason: null, tokenProvenance: "estimated" }]);
    expect(await h.root.db.select().from(messages).where(ne(messages.id, swipe.target.id))).toEqual(otherCanon);
    const types = swipe.events.map(({ type }) => type);
    expect(types).not.toContain("turnCompleted");
    expect(types.indexOf("messageCommitted")).toBeLessThan(types.indexOf("turnAborted"));
    expect(swipe.events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: "user" }]);
  } finally {
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    await settled;
  }
});

test("a swipe whose lease is stolen after actual partial tokens keeps nothing: the stale abort is unchanged", async () => {
  const stopped = corePartialReply([coreFrame({ choices: [{ delta: { content: PARTIAL } }] })]);
  await using h = await coreHttpRoom([priorReply, stopped.respond]);
  using swipe = await swipeUntilPartial(h);
  const settled = Promise.allSettled([swipe.running]);
  try {
    const before = await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, swipe.target.id)).orderBy(messageVariants.idx);
    const canonBefore = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId));
    const lease = await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get();
    const character = h.characters[0];
    if (lease === undefined || character === undefined) {
      throw new Error("the streaming swipe owns no lease to steal");
    }
    await using _peer = await seedPeerLeaseRows(h.root, {
      chatId: h.chatId,
      characterId: character.id,
      hostUserId: h.owner.userId,
      holder: "controlled-replacement-replica",
      aheadMs: lease.expiresAt - h.root.clock.now() + 1,
    });
    h.root.timers.advance(Math.floor((lease.expiresAt - lease.acquiredAt) / 3));
    await expect(swipe.running).rejects.toMatchObject({ code: "aborted" });
    await stopped.closed;
    await h.root.settleBackground();
    expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.messageId, swipe.target.id)).orderBy(messageVariants.idx)).toEqual(before);
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual(canonBefore);
    expect(swipe.events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: "stale" }]);
    expect(swipe.events.map(({ type }) => type)).not.toContain("messageCommitted");
  } finally {
    await settled;
  }
});
