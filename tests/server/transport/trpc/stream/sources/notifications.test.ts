// The `notifications` ROOM on the multiplexed socket (SSE-1 S3) — the per-user durable inbox, MOVED here
// with its generator from `routers/notifications.ts::notifications` (PD-23). The cases came with it,
// unchanged in what they assert; only the wire moved: the durable resume cursor rides `frame.seq` instead of
// the tracked envelope id, which is now a per-socket ordinal.
//
// Load-bearing, and all three are properties the deleted procedure had:
//   • DURABLE-FIRST RESUME — a cursor replays the inbox rows with `seq > cursor`, ASCENDING, before the live
//     bus; a CURSOR-LESS attach replays nothing (the client already loaded `list`).
//   • THE PD-106 MULTI-HUMAN BELT — relocated from `multiHumanProcedure` onto this room's `authorizeAttach`
//     (the socket itself stays `authedProcedure` so a single-user deployment keeps its other rooms). Same
//     uniform NOT_FOUND: the room reads as nonexistent, never as a FORBIDDEN that advertises the capability.
//   • A THROWN DOMAIN ERROR IS TYPED, NEVER A RAW 500 — what `withSubscriptionErrors` gave the whole stream
//     before the fold is now a per-ROOM `roomFailed` frame, so the inbox's durable replay failing no longer
//     takes the tab's chat/user rooms down with it.

import type { StreamFrame } from "@orb/contracts/stream";
import { DomainUnavailableError } from "@orb/kit/errors";
import type { ChatId, NotificationId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { InboxView, NotificationsService } from "@orb/server/domain/notifications";
import type { Context } from "@orb/server/transport/trpc";
import { publishNotification, publishUserEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";
import { caller, makeContext, principal } from "../../_support.ts";

const RECIPIENT = castId<UserId>("user_recipient");

/** A fresh socketId per attach. The registry is per-Context (isolated), but the notifications bus is
 *  process-local, so a distinct id keeps a stray publish from a prior test out of this one's frames. */
let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_inbox_${socketSeq}`);
}

function inboxView(seq: number): InboxView {
  return {
    id: castId<NotificationId>(`notification_${seq}`),
    type: "kicked",
    payload: { type: "kicked", recipientUserId: RECIPIENT, chatId: castId<ChatId>("chat_1") },
    seq,
    readAt: null,
    dismissedAt: null,
    createdAt: 0,
  };
}

/** The tracked envelope's parts (`[ordinal, frame, symbol]` on the server side of `createCaller`). */
function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}
/** One pulled `notifications` DATA frame — the durable cursor rides the FRAME, not the envelope id. */
function inboxFrame(result: IteratorResult<unknown>): Extract<StreamFrame, { channel: "notifications" }> {
  const frame = frameOf(result.value);
  if (frame.channel !== "notifications") {
    throw new Error(`expected a notifications frame, got ${frame.channel}${frame.channel === "control" ? `/${frame.type}` : ""}`);
  }
  return frame;
}

function ctxWith(notifications: Partial<NotificationsService>, multiHumanCapable = true): Context {
  return makeContext({
    auth: principal("user", { userId: RECIPIENT }),
    services: { notifications },
    multiHumanCapable,
  });
}

/** Attach the inbox room, connect the socket, and drain the `attached` control ack — leaving an iterator
 *  parked exactly where the old `notifications.notifications` subscription's iterator started. */
async function openInboxRoom(ctx: Context, opts: { readonly sinceSeq?: number } = {}): Promise<AsyncIterator<unknown>> {
  const socketId = nextSocket();
  const call = caller(ctx);
  await call.stream.attach({ socketId, ref: { channel: "notifications" }, ...(opts.sinceSeq === undefined ? {} : { sinceSeq: opts.sinceSeq }) });
  const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
  const iterator = socket[Symbol.asyncIterator]();
  const ack = await iterator.next();
  expect(frameOf(ack.value)).toEqual({ channel: "control", type: "attached", ref: { channel: "notifications" } });
  return iterator;
}

describe("the notifications room — durable-first resume", () => {
  test("replays durable rows newer than the cursor, ascending, before going live", async () => {
    // Newest-first page (the inbox `list` contract); only seq 6 and 7 are newer than the cursor 5.
    const list = vi.fn<NotificationsService["list"]>(async () => ({
      items: [inboxView(7), inboxView(6), inboxView(5), inboxView(4)],
      nextCursor: 4,
    }));

    const iterator = await openInboxRoom(ctxWith({ list }), { sinceSeq: 5 });
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // The durable replay happened (the inbox table was read for the resume) …
    expect(list).toHaveBeenCalled();
    // … and the missed rows replay ASCENDING (6 then 7), each carrying its durable seq as the frame cursor.
    expect(inboxFrame(first).seq).toBe(6);
    expect(inboxFrame(first).event.seq).toBe(6);
    expect(inboxFrame(second).seq).toBe(7);
  });

  test("a CURSOR-LESS attach replays nothing and goes straight live — the client already loaded `list`", async () => {
    const list = vi.fn<NotificationsService["list"]>();
    const iterator = await openInboxRoom(ctxWith({ list }));

    const pending = iterator.next(); // parks the pump in the live loop before anything is published
    publishNotification(inboxView(9));
    const first = await pending;
    await iterator.return?.(undefined);

    // No durable read at all — the first frame is the LIVE arrival, at its own durable seq.
    expect(list).not.toHaveBeenCalled();
    expect(inboxFrame(first).seq).toBe(9);
  });

  test("the replay/live overlap is deduped by the monotonic seq — a re-published replayed row is dropped", async () => {
    const list = vi.fn<NotificationsService["list"]>(async () => ({ items: [inboxView(6)], nextCursor: null }));
    const iterator = await openInboxRoom(ctxWith({ list }), { sinceSeq: 5 });
    const replayed = await iterator.next();

    const pending = iterator.next();
    publishNotification(inboxView(6)); // the same row the replay already delivered
    publishNotification(inboxView(7));
    const next = await pending;
    await iterator.return?.(undefined);

    expect(inboxFrame(replayed).seq).toBe(6);
    // 6 was withheld as a duplicate; the next frame is 7, not a second 6.
    expect(inboxFrame(next).seq).toBe(7);
  });
});

describe("the notifications room — the PD-106 multi-human belt, relocated onto the attach", () => {
  test("a deployment that cannot seat a second human refuses the room as NOT_FOUND (it reads as nonexistent)", async () => {
    const list = vi.fn<NotificationsService["list"]>();
    const call = caller(ctxWith({ list }, false));

    // The same verdict `multiHumanProcedure` gave the deleted procedure — a uniform NOT_FOUND, never a
    // FORBIDDEN that would confirm the capability exists.
    await expect(call.stream.attach({ socketId: nextSocket(), ref: { channel: "notifications" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(list).not.toHaveBeenCalled();
  });

  test("the refusal is the ROOM's, not the socket's — a single-user deployment keeps its other rooms", async () => {
    // The reason the belt could not stay on the procedure: `stream.connect` is `authedProcedure`, so a
    // single-user deployment must still attach `user`/`chat`/`rpg`. Only the inbox room is refused.
    const socketId = nextSocket();
    const call = caller(ctxWith({}, false));

    await expect(call.stream.attach({ socketId, ref: { channel: "user" } })).resolves.toBeUndefined();
    await expect(call.stream.attach({ socketId, ref: { channel: "notifications" } })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    const ack = await iterator.next();
    const pending = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    publishUserEvent(RECIPIENT, { type: "tagsChanged" });
    const live = await pending;
    await iterator.return?.(undefined);

    expect(frameOf(ack.value)).toEqual({ channel: "control", type: "attached", ref: { channel: "user" } });
    expect(frameOf(live.value)).toEqual({ channel: "user", event: { type: "tagsChanged" } });
  });
});

describe("the notifications room — a failing durable replay is a TYPED per-room frame", () => {
  test("a throwing `list` becomes roomFailed with the classified code, and the socket's other room survives", async () => {
    // Before the fold this throw ended the WHOLE stream (`withSubscriptionErrors` yields a terminal frame and
    // returns). Under the multiplex it is one room's fault: the inbox room detaches with a typed frame the
    // client surfaces as a toast, and every other room on the tab keeps delivering.
    const socketId = nextSocket();
    const list = vi.fn<NotificationsService["list"]>(() => Promise.reject(new DomainUnavailableError("inbox read unavailable")));
    const call = caller(ctxWith({ list }));
    await call.stream.attach({ socketId, ref: { channel: "notifications" }, sinceSeq: 3 });
    await call.stream.attach({ socketId, ref: { channel: "user" } });

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    const frames: StreamFrame[] = [];
    const first = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    publishUserEvent(RECIPIENT, { type: "tagsChanged" });
    frames.push(frameOf((await first).value));
    for (let i = 1; i < 5; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      const result = await iterator.next();
      frames.push(frameOf(result.value));
    }
    await iterator.return?.(undefined);

    expect(frames).toContainEqual({
      channel: "control",
      type: "roomFailed",
      ref: { channel: "notifications" },
      code: "SERVICE_UNAVAILABLE",
      message: "inbox read unavailable",
    });
    expect(frames).toContainEqual({ channel: "control", type: "detached", ref: { channel: "notifications" } });
    // The socket is ALIVE: the unrelated room's event still arrives.
    expect(frames).toContainEqual({ channel: "user", event: { type: "tagsChanged" } });
  });
});
