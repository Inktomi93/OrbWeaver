// The chat_locks turn lease: a live heartbeat extends expires_at, cancellation releases the row, and a stolen
// lease aborts physical I/O before any canon row while the replacement holder's row stays untouched.
// @subject packages/server/src/domain/chat/engine/engine.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatLocks, messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { seedPeerLease } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { coreFrame, coreHeldReply, coreHttpRoom, coreSse } from "../engine/core-physical.ts";

function force(h: ChatRoot): ReturnType<ChatRoot["root"]["services"]["chat"]["forceCharacterTurn"]> {
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual lease fixture has no present character");
  }
  return h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
}

test("the actual heartbeat refreshes its live lease, caller cancellation joins it, and the next turn can commit", async () => {
  const held = coreHeldReply();
  await using h = await coreHttpRoom([
    held.respond,
    (): Response =>
      coreSse([
        coreFrame({ choices: [{ delta: { content: "The next turn commits." } }] }),
        terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
      ]),
  ]);
  const pending = h.root.timers.pending();
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const running = force(h);
  const settled = Promise.allSettled([running]);
  try {
    const signal = await Promise.race([
      held.reached,
      running.then(() => {
        throw new Error("the public turn settled before physical HTTP admission");
      }),
    ]);
    const lease = await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get();
    if (lease === undefined) {
      throw new Error("the held real generation owns no turn lease");
    }
    h.root.timers.advance(Math.floor((lease.expiresAt - lease.acquiredAt) / 3));
    await expect
      .poll(async () => (await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get())?.expiresAt)
      .toBeGreaterThan(lease.expiresAt);
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    expect(await running).toMatchObject({ aborted: true, abortReason: "user", messages: [] });
    expect(signal.aborted).toBe(true);
    await h.root.settleBackground();
    expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: "user" }]);
    expect(events.map((event) => event.type)).not.toContain("turnCompleted");
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([]);
    expect(h.root.timers.pending()).toBe(pending);
    const next = await force(h);
    expect(next.aborted).toBe(false);
    expect(next.messages).toMatchObject([{ seq: 1, content: "The next turn commits." }]);
    expect(h.root.timers.pending()).toBe(pending);
  } finally {
    held.release();
    await settled;
  }
});

test("a stolen actual lease aborts physical I/O before canon and leaves the replacement holder untouched", async () => {
  const held = coreHeldReply();
  await using h = await coreHttpRoom([held.respond]);
  const pending = h.root.timers.pending();
  const running = force(h);
  const settled = Promise.allSettled([running]);
  try {
    const signal = await Promise.race([
      held.reached,
      running.then(() => {
        throw new Error("the public turn settled before physical HTTP admission");
      }),
    ]);
    const lease = await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get();
    if (lease === undefined) {
      throw new Error("the physically held turn has no lease to steal");
    }
    const character = h.characters[0];
    if (character === undefined) {
      throw new Error("the actual lease fixture has no voice for the peer replica");
    }
    await using peer = await seedPeerLease(h.root, {
      chatId: h.chatId,
      characterId: character.id,
      hostUserId: h.owner.userId,
      holder: "controlled-replacement-replica",
      aheadMs: lease.expiresAt - h.root.clock.now() + 1,
    });
    h.root.timers.advance(Math.floor((lease.expiresAt - lease.acquiredAt) / 3));
    await expect(running).rejects.toMatchObject({ code: "aborted" });
    await h.root.settleBackground();
    expect(signal.aborted).toBe(true);
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toEqual([]);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toEqual([peer.row]);
    expect(h.root.timers.pending()).toBe(pending);
  } finally {
    held.release();
    await settled;
  }
});
