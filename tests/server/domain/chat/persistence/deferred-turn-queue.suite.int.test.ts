// A host-offline send queues one pending_turns row carrying the member's identity and the host's run-as
// principal; the drain consumes the row and commits the owed reply. A Stop on the owed reply that kept text
// settles the debt, and so does a Stop that kept nothing (the reader does not want that reply); only a transient fault
// leaves the row queued for the next drain.
// @subject packages/server/src/domain/chat/verbs/turn.ts

import type { TurnAbortReason } from "@orb/contracts/chat";
import type { NotificationType } from "@orb/contracts/notifications";
import { messages, messageVariants, notifications, pendingTurns } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import { connectDevice, freshHeldDb, readRoomCanon } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import type { CoreWireReply } from "../engine/core-physical.ts";
import { coreFrame, coreHeldReply, coreHttpRoom, corePartialReply, coreProse } from "../engine/core-physical.ts";
import { textRoom } from "../scenario-physical.ts";

const DRAIN_TIMEOUT_MS = 10_000;
const KEPT = "The lantern gutters as the door";
const USER_STOP = "user" satisfies TurnAbortReason;
const SHUTDOWN = "shutdown" satisfies TurnAbortReason;
const DROPPED_NOTICE = "deferred-turn-dropped" satisfies NotificationType;

test("a member's host-offline send queues the frozen identity and the host reconnecting consumes it once", async () => {
  await using h = await textRoom(["The owed reply."], { group: { policy: "list", output: "per-speaker" } });
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const outcome = await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "An owed reply.", timeZone: UTC_TIME_ZONE });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "user", authorUserId: member.userId, content: "An owed reply." });
  const queued = await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId));
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({ triggeredBy: member.userId, runAsUserId: h.owner.userId, timeZone: UTC_TIME_ZONE });
  expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
  const online = new AbortController();
  await connectDevice(h.root, h.owner.userId, online.signal);
  try {
    // The host-return edge of the connect drains the queue on its own; wait for the owed reply to land.
    const canonOf = (): Promise<(typeof messages.$inferSelect)[]> =>
      h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
    await expect.poll(async () => (await canonOf()).map(({ role }) => role), { timeout: DRAIN_TIMEOUT_MS }).toEqual(["user", "assistant"]);
    await h.root.settleBackground();
    expect(await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId))).toEqual([]);
    const canon = await canonOf();
    expect(canon[1]?.characterId).toBe(h.characters[0]?.id);
    expect(await h.root.services.chat.drainDeferredTurns({ hostUserId: h.owner.userId })).toEqual({ ran: 0, dropped: 0 });
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
  } finally {
    online.abort();
  }
});

interface OwedRoom {
  readonly h: ChatRoot;
  readonly member: Awaited<ReturnType<ChatRoot["root"]["principalFor"]>>;
}

/** A member's send while the host is offline, leaving exactly one owed row. The host stays offline: each case
 *  runs the drain verb itself, so the drain's verdict is awaited rather than raced against a connect edge. */
async function owedRoom(replies: readonly CoreWireReply[], options: Omit<ChatRootOptions, "providerFetch"> = {}): Promise<OwedRoom & AsyncDisposable> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await coreHttpRoom(replies, options));
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  await h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "An owed reply.", timeZone: UTC_TIME_ZONE });
  expect(await queuedRows(h)).toBe(1);
  const lifetime = construction.move();
  return { h, member, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function queuedRows(h: ChatRoot): Promise<number> {
  return (await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, h.chatId))).length;
}

async function dropNotices(room: OwedRoom): Promise<number> {
  const rows = await room.h.root.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, room.member.userId), eq(notifications.type, DROPPED_NOTICE)));
  return rows.length;
}

/** Drain the owed row and press the member's Stop once `reached` resolves; returns the drain's report. */
async function stopTheDrain(
  room: OwedRoom,
  reached: Promise<unknown>,
): Promise<Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["drainDeferredTurns"]>>> {
  const { h, member } = room;
  const draining = h.root.services.chat.drainDeferredTurns({ hostUserId: h.owner.userId });
  const settled = Promise.allSettled([draining]);
  try {
    await Promise.race([
      reached,
      draining.then(() => {
        throw new Error("the drain settled before the Stop point");
      }),
    ]);
    await h.root.services.chat.abort({ principal: member, chatId: h.chatId });
    const report = await draining;
    await h.root.settleBackground();
    return report;
  } finally {
    await h.root.services.chat.abort({ principal: member, chatId: h.chatId });
    await settled;
  }
}

test("a member's Stop on an owed reply that kept text settles the debt: no re-queue, no second reply, no drop notice", async () => {
  const partial = corePartialReply([coreFrame({ choices: [{ delta: { content: KEPT } }] })]);
  await using room = await owedRoom([partial.respond]);
  const report = await stopTheDrain(room, partial.streamed);
  await partial.closed;
  expect(report).toEqual({ ran: 1, dropped: 0 });
  expect(await queuedRows(room.h)).toBe(0);
  expect(await dropNotices(room)).toBe(0);
  const canon = await room.h.root.db.select().from(messages).where(eq(messages.chatId, room.h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ role }) => role)).toEqual(["user", "assistant"]);
  const kept = await readRoomCanon(room.h.root, room.member, room.h.chatId);
  expect(kept.at(-1)).toMatchObject({ role: "assistant", content: KEPT, terminalReason: USER_STOP });
  // The room's reply plan holds one call, so a re-run of the debt would fail on the unscripted request.
  expect(await room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId })).toEqual({ ran: 0, dropped: 0 });
});

test("a member's Stop on an owed reply before any text drops the debt: no re-queue, no second generation, no drop notice", async () => {
  const held = coreHeldReply();
  // The plan holds one call: a re-run of the cancelled debt would fail on the unscripted request.
  await using room = await owedRoom([held.respond]);
  const report = await stopTheDrain(room, held.reached);
  expect(report).toEqual({ ran: 1, dropped: 0 });
  expect(await queuedRows(room.h)).toBe(0);
  expect(await dropNotices(room)).toBe(0);
  const listed = async (): Promise<readonly string[]> => (await readRoomCanon(room.h.root, room.member, room.h.chatId)).map(({ role }) => role);
  expect(await listed()).toEqual(["user"]);
  expect(await room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId })).toEqual({ ran: 0, dropped: 0 });
  await room.h.root.settleBackground();
  expect(await listed()).toEqual(["user"]);
  expect(await room.h.root.services.stats.overview(room.h.owner.userId)).toMatchObject({ assistantTurns: 0, tokensIn: null, tokensOut: null });
});

test("a shutdown that cuts an owed reply before any text is not a Stop: the debt stays queued", async () => {
  using held = await freshHeldDb();
  const reply = coreHeldReply();
  await using ownership = new AsyncDisposableStack();
  const room = ownership.use(await owedRoom([reply.respond], { server: { db: held.db } }));
  const queued = (): Promise<(typeof pendingTurns.$inferSelect)[]> => held.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, room.h.chatId));
  const before = await queued();
  const draining = room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId });
  const settled = Promise.allSettled([draining]);
  try {
    await Promise.race([
      reply.reached,
      draining.then(() => {
        throw new Error("the drain settled before the shutdown point");
      }),
    ]);
    // The process closing disposes the chat graph, whose active-turns registry aborts the drain's in-flight round.
    await ownership.disposeAsync();
    expect(await draining).toEqual({ ran: 0, dropped: 0 });
    expect(await queued()).toEqual(before);
    expect(await held.db.select().from(notifications).where(eq(notifications.type, DROPPED_NOTICE))).toEqual([]);
  } finally {
    reply.release();
    await settled;
  }
});

test("a shutdown that cuts an owed reply after text keeps the text, which settles the debt: no re-queue, no second reply", async () => {
  using held = await freshHeldDb();
  const partial = corePartialReply([coreFrame({ choices: [{ delta: { content: KEPT } }] })]);
  await using ownership = new AsyncDisposableStack();
  const room = ownership.use(await owedRoom([partial.respond], { server: { db: held.db } }));
  const draining = room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId });
  const settled = Promise.allSettled([draining]);
  try {
    await Promise.race([
      partial.streamed,
      draining.then(() => {
        throw new Error("the drain settled before the shutdown point");
      }),
    ]);
    await ownership.disposeAsync();
    expect(await draining).toEqual({ ran: 1, dropped: 0 });
  } finally {
    await settled;
  }
  expect(await held.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, room.h.chatId))).toEqual([]);
  expect(await held.db.select().from(notifications).where(eq(notifications.type, DROPPED_NOTICE))).toEqual([]);
  expect((await held.db.select().from(messages).where(eq(messages.chatId, room.h.chatId)).orderBy(messages.seq)).map(({ role }) => role)).toEqual([
    "user",
    "assistant",
  ]);
  expect(await held.db.select().from(messageVariants).where(eq(messageVariants.content, KEPT))).toMatchObject([{ content: KEPT, terminalReason: SHUTDOWN }]);
});

/** A stream that delivers one text frame and then loses its connection. Text has streamed, so the provider layer
 *  cannot retry it inside the call, and the fault reaches the drain. */
function droppedStream(): Response {
  let pulls = 0;
  return new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(controller): void {
          if (pulls++ === 0) {
            controller.enqueue(new TextEncoder().encode(`${coreFrame({ choices: [{ delta: { content: KEPT } }] })}\n\n`));
            return;
          }
          controller.error(new Error("controlled connection reset"));
        },
      },
      { highWaterMark: 0 },
    ),
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("a connection lost mid-stream on an owed reply keeps nothing and re-queues it without a drop notice", async () => {
  await using room = await owedRoom([droppedStream, (): Response => coreProse("The owed reply after the outage.")]);
  expect(await room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId })).toEqual({ ran: 0, dropped: 0 });
  await room.h.root.settleBackground();
  expect(await queuedRows(room.h)).toBe(1);
  expect(await dropNotices(room)).toBe(0);
  expect((await readRoomCanon(room.h.root, room.member, room.h.chatId)).map(({ role }) => role)).toEqual(["user"]);
  expect(await room.h.root.services.chat.drainDeferredTurns({ hostUserId: room.h.owner.userId })).toEqual({ ran: 1, dropped: 0 });
  await room.h.root.settleBackground();
  expect(await queuedRows(room.h)).toBe(0);
});
