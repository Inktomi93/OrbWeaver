// The `notifications` ROOM on the multiplexed socket (SSE-1 S3) — the per-user durable inbox, MOVED here
// with its generator from `routers/notifications.ts::notifications` (PD-23). The cases came with it,
// unchanged in what they assert; only the wire moved: the durable resume cursor rides `frame.seq` instead of
// the tracked envelope id, which is now a per-socket ordinal.
//
// Load-bearing, and all three are properties the deleted procedure had:
//   • DURABLE-FIRST RESUME — a cursor replays the inbox rows with `seq > cursor`, ASCENDING, before the live
//     bus; a CURSOR-LESS attach replays nothing (the client already loaded `list`).
//   • AUTHED IS THE WHOLE GATE (#1627). The room carried the PD-106 multi-human belt on its `authorizeAttach`
//     until single-human notification sources landed; the belt is off, `stream.attach` stays `authedProcedure`,
//     and the per-user scope is structural (the channel key IS `principal.userId`). See the describe below.
//   • A THROWN DOMAIN ERROR IS TYPED, NEVER A RAW 500 — what `withSubscriptionErrors` gave the whole stream
//     before the fold is now a per-ROOM `roomFailed` frame, so the inbox's durable replay failing no longer
//     takes the tab's chat/user rooms down with it.
//
// #1459 — THE WATERMARK MAY NEVER PASS A ROW THAT WAS NOT YIELDED. The replay used to page the inbox
// NEWEST-first through `list` under a 10×100 bound and stop silently at the bound, holding the TOP of the log
// while skipping its middle — and then advance the room cursor to the newest row it held, so the skipped rows
// were never offered by any later replay. The three pins at the bottom of this file drive the room source's
// pump DIRECTLY (no socket queue in the way, so the assertions are about the SOURCE's contract): a backlog
// past the old bound arrives whole, a row landing mid-replay arrives exactly once, and a pump killed
// mid-replay resumes at exactly the row it last delivered.

import { NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import type { StreamFrame } from "@orb/contracts/stream";
import { DomainUnavailableError } from "@orb/kit/errors";
import type { ChatId, NotificationId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { InboxView, NotificationsService } from "@orb/server/domain/notifications";
import type { Context } from "@orb/server/transport/trpc";
import { publishNotification, publishUserEvent, ROOM_SOURCES } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";
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
    // `kicked` is informational — it asks nothing of its reader, so it never raises the bell's dot (#1799).
    actionable: false,
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

/** A fake DURABLE inbox over an in-memory ascending log, served through the room's resume read. `push` is how
 *  a test lands a row MID-REPLAY. The `limit` clamp mirrors the verb's (`NOTIFICATIONS_LIST_MAX_LIMIT`), which
 *  is what makes the pump's "a short page is the tail" reading honest. */
function inboxLog(seqs: readonly number[]): {
  readonly replaySince: NotificationsService["replaySince"];
  readonly push: (seq: number) => void;
  readonly pages: number[];
} {
  const rows: InboxView[] = seqs.map(inboxView);
  const pages: number[] = [];
  const replaySince: NotificationsService["replaySince"] = ({ afterSeq, limit }): Promise<readonly InboxView[]> => {
    pages.push(afterSeq);
    const page = rows.filter((row) => row.seq > afterSeq).slice(0, Math.min(limit ?? NOTIFICATIONS_LIST_MAX_LIMIT, NOTIFICATIONS_LIST_MAX_LIMIT));
    return Promise.resolve(page);
  };
  return {
    replaySince,
    push: (seq): void => {
      rows.push(inboxView(seq));
    },
    pages,
  };
}

/** Drive the room source's pump DIRECTLY and collect the seqs of the first `take` frames, then abort it —
 *  exactly what a socket death / detach does to a running replay. */
async function pump(notifications: Partial<NotificationsService>, opts: { readonly cursor: number | null; readonly take: number }): Promise<number[]> {
  const controller = new AbortController();
  const seen: number[] = [];
  const args = {
    ref: { channel: "notifications" } as const,
    principal: principal("user", { userId: RECIPIENT }),
    services: ctxWith(notifications).services,
    multiHumanCapable: true,
    cursor: opts.cursor,
    signal: controller.signal,
  };
  for await (const frame of ROOM_SOURCES.notifications.run(args)) {
    // `RoomSourceDef.run` is typed over the whole data-frame union; this room only ever yields its own arm.
    if (frame.channel !== "notifications") {
      throw new Error(`the notifications room yielded a ${frame.channel} frame`);
    }
    seen.push(frame.seq);
    if (seen.length >= opts.take) {
      break;
    }
  }
  controller.abort();
  return seen;
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
    const replaySince = vi.fn<NotificationsService["replaySince"]>(inboxLog([4, 5, 6, 7]).replaySince);

    const iterator = await openInboxRoom(ctxWith({ replaySince }), { sinceSeq: 5 });
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // The durable replay happened (the inbox table was read for the resume) …
    expect(replaySince).toHaveBeenCalled();
    // … and the missed rows replay ASCENDING (6 then 7), each carrying its durable seq as the frame cursor.
    expect(inboxFrame(first).seq).toBe(6);
    expect(inboxFrame(first).event.seq).toBe(6);
    expect(inboxFrame(second).seq).toBe(7);
  });

  test("a CURSOR-LESS attach replays nothing and goes straight live — the client already loaded `list`", async () => {
    const replaySince = vi.fn<NotificationsService["replaySince"]>();
    const iterator = await openInboxRoom(ctxWith({ replaySince }));

    const pending = iterator.next(); // parks the pump in the live loop before anything is published
    publishNotification(inboxView(9));
    const first = await pending;
    await iterator.return?.(undefined);

    // No durable read at all — the first frame is the LIVE arrival, at its own durable seq.
    expect(replaySince).not.toHaveBeenCalled();
    expect(inboxFrame(first).seq).toBe(9);
  });

  test("the replay/live overlap is deduped by the monotonic seq — a re-published replayed row is dropped", async () => {
    const { replaySince } = inboxLog([6]);
    const iterator = await openInboxRoom(ctxWith({ replaySince }), { sinceSeq: 5 });
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

// ── #1627 — THE PD-106 BELT IS OFF THIS ROOM. ─────────────────────────────────────────────────────────
// The belt covered the inbox because every notification SOURCE was multi-human (invite/kick/host-handoff).
// Two live sources refute that on this tree — `plugin-disabled` (the crash policy → the installing owner)
// and `automation-notice` (auto-disable → the rule author, incl. the chat-less owner-global lane) — so a
// single-user deployment was accumulating durable rows whose recipient could neither list nor stream them.
// The RULING survives, its INPUT changed: `multiHumanProcedure` still carries `notifications.presence` and
// the invites router, and this room now takes the `user` room's posture (`sources/user.ts`) — there is
// nothing left to gate, because the channel key IS `principal.userId` and the resume read is caller-scoped
// inside the verb. `stream.connect`/`attach` remain `authedProcedure`, which is the belt that stayed.
describe("the notifications room — authed is the whole gate (#1627)", () => {
  test("a deployment that cannot seat a second human ATTACHES the inbox and gets its durable replay", async () => {
    const replaySince = vi.fn<NotificationsService["replaySince"]>(inboxLog([6, 7]).replaySince);
    const iterator = await openInboxRoom(ctxWith({ replaySince }, false), { sinceSeq: 5 });
    const first = await iterator.next();
    await iterator.return?.(undefined);

    // The durable rows the old belt withheld from the only human on the box.
    expect(replaySince).toHaveBeenCalled();
    expect(inboxFrame(first).seq).toBe(6);
  });

  test("both rooms attach on a single-user socket — the inbox joins `user` instead of being refused", async () => {
    const socketId = nextSocket();
    const call = caller(ctxWith({}, false));

    await expect(call.stream.attach({ socketId, ref: { channel: "user" } })).resolves.toBeUndefined();
    await expect(call.stream.attach({ socketId, ref: { channel: "notifications" } })).resolves.toBeUndefined();

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    const ack = await iterator.next();
    const secondAck = await iterator.next();
    const pending = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    publishUserEvent(RECIPIENT, { type: "tagsChanged" });
    const live = await pending;
    await iterator.return?.(undefined);

    expect([frameOf(ack.value), frameOf(secondAck.value)]).toEqual([
      { channel: "control", type: "attached", ref: { channel: "user" } },
      { channel: "control", type: "attached", ref: { channel: "notifications" } },
    ]);
    expect(frameOf(live.value)).toEqual({ channel: "user", event: { type: "tagsChanged" } });
  });

  test("an ANONYMOUS caller still cannot attach the inbox — the socket's authed gate is the surviving belt", async () => {
    const call = caller(makeContext({ auth: null, services: { notifications: {} }, multiHumanCapable: false }));

    await expect(call.stream.attach({ socketId: nextSocket(), ref: { channel: "notifications" } })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("the notifications room — a failing durable replay is a TYPED per-room frame", () => {
  test("a throwing resume read becomes roomFailed with the classified code, and the socket's other room survives", async () => {
    // Before the fold this throw ended the WHOLE stream (`withSubscriptionErrors` yields a terminal frame and
    // returns). Under the multiplex it is one room's fault: the inbox room detaches with a typed frame the
    // client surfaces as a toast, and every other room on the tab keeps delivering.
    const socketId = nextSocket();
    const replaySince = vi.fn<NotificationsService["replaySince"]>(() => Promise.reject(new DomainUnavailableError("inbox read unavailable")));
    const call = caller(ctxWith({ replaySince }));
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

// ── #1459 — the resume is COMPLETE, and its watermark is a contiguous prefix ────────────────────────────
// These drive `notificationsRoomSource.run` directly: the properties are the SOURCE's, and a socket queue in
// between would answer with its own `lag` shedding instead.
describe("the notifications room — the resume never advances past a row it did not yield (#1459)", () => {
  test("a backlog far past the old 10x100 bound replays WHOLE — every missed row, in order, none skipped", async () => {
    // 1200 durable rows above the client's cursor. The old replay paged NEWEST-first under a 1000-row bound
    // and stopped there, so it delivered 201..1200 and advanced the room cursor to 1200 — rows 1..200 were
    // never yielded and never revisited. Paging UP from the cursor cannot express that outcome.
    const backlog = Array.from({ length: 1200 }, (_, i) => i + 1);
    const { replaySince, pages } = inboxLog(backlog);

    const delivered = await pump({ replaySince }, { cursor: 0, take: backlog.length });

    expect(delivered).toEqual(backlog);
    // …and it got there by asking from the WATERMARK each time, never from a page cursor of its own.
    expect(pages).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]);
  });

  test("a row that lands MID-REPLAY reaches the client exactly once — the later page yields it, the live overlap drops it", async () => {
    // The log holds exactly one full page. Row 101 is written (and published on the bus) while page 1 is
    // being served, so it is both a durable row the replay has not reached and a live arrival already
    // buffered by the listener the pump attached first.
    const log = inboxLog(Array.from({ length: 100 }, (_, i) => i + 1));
    let landed = false;
    const replaySince: NotificationsService["replaySince"] = async (params) => {
      const page = await log.replaySince(params);
      if (!landed) {
        landed = true;
        log.push(101);
        publishNotification(inboxView(101));
      }
      return page;
    };

    const delivered = await pump({ replaySince }, { cursor: 0, take: 101 });

    expect(delivered).toHaveLength(101);
    expect(delivered.filter((seq) => seq === 101)).toEqual([101]);
    expect(delivered).toEqual([...Array.from({ length: 100 }, (_, i) => i + 1), 101]);
  });

  test("a pump killed mid-replay resumes at exactly the row it last delivered — nothing repeats, nothing is skipped", async () => {
    const backlog = Array.from({ length: 300 }, (_, i) => i + 1);
    const { replaySince } = inboxLog(backlog);

    // The socket dies 150 rows in (the pump is aborted where it stands).
    const before = await pump({ replaySince }, { cursor: 0, take: 150 });
    // The reconnect resumes from the room cursor, which is the last DELIVERED seq (`socket.ts`).
    const after = await pump({ replaySince }, { cursor: before.at(-1) ?? 0, take: 150 });

    expect(before).toEqual(backlog.slice(0, 150));
    expect(after).toEqual(backlog.slice(150));
  });
});
