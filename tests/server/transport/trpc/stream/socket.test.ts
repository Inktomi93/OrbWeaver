// `runSocket` — the COMPOSED properties of the one socket generator, driven end-to-end through the real
// ladder (createCaller → stream.attach → stream.connect → the real queue → the real `chat` room source).
// These exist because the halves were each green in isolation while the composition was broken: the queue's
// own suite stubs `cursorFor` (`() => 17`), so "the cursor a `roomLagged` carries IS the last DELIVERED seq"
// was asserted nowhere, and the cursor was in fact advancing at ENQUEUE — putting shed rows BEHIND it, where
// no replay can ever reach them (stickler F1, 2026-08-02).
//
// THE RESUME CONTRACT, in one line: `cell.rooms[key].cursor` == the last durable seq this socket actually
// YIELDED. Everything else (the withheld-row gap rule §5.5, the `lag` policy's "the replay refills it" §7,
// the reconnect story §5.3) is downstream of it.

import { createChatEventSeqGuard } from "@orb/client/data/bus";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { StreamDataFrame, StreamFrame } from "@orb/contracts/stream";
import type { ChatId, SessionId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import type { SocketRegistry } from "@orb/server/transport/trpc";
import { createSocketRegistry, FRAME_QUEUE_CAPACITY, publishChatEvent } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");

let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_composed_${socketSeq}`);
}

/** The member-gated attach probe — an unclamped HOST (`viewerIsHost`, so every event rides verbatim: these
 *  assertions are about DELIVERY, never projection, and a member's per-event strip would only add noise).
 *  `maxSeq` is generous so no truncation synthesis fires. */
const bounds: ChatService["chatEventBounds"] = () =>
  Promise.resolve({ minSeq: 1, maxSeq: 10_000, historyFloorSeq: 0, viewerIsHost: true, reasoningHostOnly: false });

function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}
function isChatFrame(frame: StreamFrame): frame is Extract<StreamDataFrame, { channel: "chat" }> {
  return frame.channel === "chat";
}

/** The pump-synthesized attach signals — never durable rows (`chat-event-seq-guard.ts` exempts them by type). */
const SYNTHETIC_TYPES: ReadonlySet<ChatBusEvent["type"]> = new Set<ChatBusEvent["type"]>(["chatOpened", "historyTruncated"]);

describe("the room cursor counts DELIVERED frames, never enqueued ones", () => {
  test("three rows enqueued, ONE pulled → the cell cursor is the pulled one (the shed/disconnect fence)", async () => {
    const chatId = castId<ChatId>("chat_cursor_delivery");
    const sockets: SocketRegistry = createSocketRegistry(() => 0);
    const socketId = nextSocket();
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
      sockets,
    });
    const call = caller(ctx);
    await call.stream.attach({ socketId, ref: { channel: "chat", chatId } });
    const cell = sockets.adopt(MEMBER, socketId, null);

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    await iterator.next(); // the `attached` ack
    await iterator.next(); // chatOpened (seq 0 — the non-advancing cursor synthesis)

    // Three durable rows land while the consumer is slow: all three are ENQUEUED, only the first is PULLED.
    publishChatEvent({ seq: 5, event: { type: "chatUpdated", chatId } });
    publishChatEvent({ seq: 6, event: { type: "chatUpdated", chatId } });
    publishChatEvent({ seq: 7, event: { type: "chatUpdated", chatId } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const first = frameOf((await iterator.next()).value);

    expect(isChatFrame(first) ? first.seq : null).toBe(5);
    // THE PIN: rows 6 and 7 are queued, not delivered — they MUST stay ahead of the cursor, because a socket
    // that dies right now resumes from it and anything behind it is never re-offered. (Advancing at enqueue
    // put this at 7 and lost rows 6+7 permanently.)
    expect(cell.rooms.get(`chat:${chatId}`)?.cursor).toBe(5);

    await iterator.return?.(undefined);
    // Teardown does not fabricate progress either: the undelivered rows are still ahead of the cursor.
    expect(cell.rooms.get(`chat:${chatId}`)?.cursor).toBe(5);
  });
});

describe("a `lag` shed heals itself — the stranded-terminal class", () => {
  test("a turn TERMINAL shed by an overflow is re-delivered by the room's restart replay", async () => {
    // The scenario that made this MANDATORY: a backgrounded tab during a long turn. Every token delta is one
    // durable frame, so the socket queue saturates, sheds the room's tail — and the tail holds the turn's
    // `turnCompleted`. The chat-stream store clears a slot ONLY on a terminal, so losing it strands the slot
    // and the composer's Stop sticks forever (the seq-guard's own P1). Pre-fold this healed on reconnect via
    // `Last-Event-ID`; the fold has to heal it without one.
    const chatId = castId<ChatId>("chat_shed_terminal");
    // A durable log longer than the queue: N deltas then the terminal. The fake replays it the way the real
    // verb does — every row after the cursor, in seq order.
    const rows: { readonly seq: number; readonly event: ChatBusEvent }[] = [];
    const deltaCount = FRAME_QUEUE_CAPACITY + 40;
    for (let i = 1; i <= deltaCount; i++) {
      rows.push({ seq: i, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: `t${i}` } } });
    }
    const terminalSeq = deltaCount + 1;
    rows.push({ seq: terminalSeq, event: { type: "turnCompleted", chatId, intent: "send", messageId: null } });

    const replayChatEvents: ChatService["replayChatEvents"] = ({ afterSeq }) => Promise.resolve(rows.filter((r) => r.seq > (afterSeq ?? 0)));
    const sockets: SocketRegistry = createSocketRegistry(() => 0);
    const socketId = nextSocket();
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents } },
      sockets,
    });
    const call = caller(ctx);
    // `sinceSeq: 0` — the client asking for the whole log (the draft-promotion seed / a reconnect at a mark).
    await call.stream.attach({ socketId, ref: { channel: "chat", chatId }, sinceSeq: 0 });
    const cell = sockets.adopt(MEMBER, socketId, null);

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    // The first pull starts the generator (and its pump); then the consumer STALLS — the backgrounded tab.
    // The pump keeps replaying into the bounded queue with nobody draining it, which is the only way to
    // reach the overflow this test is about.
    await iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 25));

    // Now drain until the terminal arrives: the shed already happened, so what follows is the recovery —
    // the socket restarted the room from its last-DELIVERED cursor and the replay refills the tail.
    let sawLag = false;
    let sawOpened = false;
    let sawTerminal = false;
    let pulls = 0;
    const seqs: number[] = [];
    for (; pulls < 4000 && !sawTerminal; pulls++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      const frame = frameOf((await iterator.next()).value);
      if (frame.channel === "control" && frame.type === "roomLagged") {
        sawLag = true;
        continue;
      }
      if (!isChatFrame(frame)) {
        continue;
      }
      // The attach SYNTHETIC the resumed pump re-fires (never a durable row; exempt-by-type on the client,
      // where it is also the invalidate that refetches the chat's canon).
      if (frame.event.type === "chatOpened") {
        sawOpened = true;
        continue;
      }
      seqs.push(frame.seq);
      sawTerminal = frame.event.type === "turnCompleted";
    }
    await iterator.return?.(undefined);

    // The shed really happened (otherwise this test proves nothing)…
    expect(sawLag).toBe(true);
    expect(pulls).toBeLessThan(4000);
    // …and NOTHING was lost by it. THE PIN: delivery is a contiguous PREFIX of the durable log, terminal
    // included. Without the shed's restart the pump just keeps going from where it was — the shed rows are
    // simply gone (a HOLE in this sequence), and a hole that swallows a turn terminal strands the client's
    // slot forever. With the restart, every shed row is re-offered from the last-delivered cursor, so the
    // sequence closes up and the seq-guard on the other end has nothing to drop.
    expect(seqs).toEqual(rows.map((r) => r.seq));
    expect(sawTerminal).toBe(true);
    // The resume re-ran the room's attach synthesis, so the client also gets the canon-refetch invalidate.
    expect(sawOpened).toBe(true);
    // The cursor ends where delivery ended — the property the whole heal rests on.
    expect(cell.rooms.get(`chat:${chatId}`)?.cursor).toBe(terminalSeq);
  });

  test("a room re-attached while its lag notice is still pending still gets its shed rows back", async () => {
    // The park-skip corner: something restarts a parked room's pump BEFORE its notice delivers (a re-attach,
    // a rewind), so the pump is running again when the notice finally lands. If the resume skipped on
    // "a pump already exists", every row shed in that window would be orphaned — the running pump's own
    // high-water mark has passed them, and the one thing that re-reads them just no-op'd. The resume is
    // therefore unconditional, and the park fires on EVERY shed rather than once per notice.
    const chatId = castId<ChatId>("chat_park_skip");
    const rows: { readonly seq: number; readonly event: ChatBusEvent }[] = [];
    const total = FRAME_QUEUE_CAPACITY + 60;
    for (let i = 1; i <= total; i++) {
      rows.push({ seq: i, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: `t${i}` }, memberText: null } });
    }
    const replayChatEvents: ChatService["replayChatEvents"] = ({ afterSeq }) => Promise.resolve(rows.filter((r) => r.seq > (afterSeq ?? 0)));
    const sockets: SocketRegistry = createSocketRegistry(() => 0);
    const socketId = nextSocket();
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents } },
      sockets,
    });
    const call = caller(ctx);
    await call.stream.attach({ socketId, ref: { channel: "chat", chatId }, sinceSeq: 0 });

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    await iterator.next(); // start the generator, then STALL so the queue saturates and sheds
    await new Promise((resolve) => setTimeout(resolve, 25));
    // …and NOW, with the notice still sitting undelivered in the queue, the client re-attaches the room
    // (a reconnect's re-announce, or any idempotent re-attach) — which restarts the pump.
    await call.stream.attach({ socketId, ref: { channel: "chat", chatId } });
    await new Promise((resolve) => setTimeout(resolve, 25));

    const seqs: number[] = [];
    let pulls = 0;
    for (; pulls < 6000 && seqs.at(-1) !== total; pulls++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      const frame = frameOf((await iterator.next()).value);
      if (isChatFrame(frame) && frame.event.type !== "chatOpened") {
        seqs.push(frame.seq);
      }
    }
    await iterator.return?.(undefined);

    expect(pulls).toBeLessThan(6000);
    // Still the whole log, in order: the re-attach's restart did not orphan the rows shed around it.
    expect(seqs).toEqual(rows.map((r) => r.seq));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE RECONNECT BARRIER — the server half of the resume contract, pinned against the REAL client guard.
// A socket's cursor counts frames handed to its WRITER, so after a mid-turn drop it sits ahead of what the
// client received. If the reconnected socket resumes from it, the rows it delivers advance the client's own
// high-water mark PAST the gap — and the rewind attach that follows (carrying the client's true mark) has
// its entire replay dropped by that same guard. A lost turn TERMINAL then strands the slot forever: the
// reducer clears a slot only on a terminal, so the composer's Stop sticks with no recovery but a reload.
// The barrier holds a resumable room's delivery until the client announces, which makes the client's mark
// the resume truth again — what `Last-Event-ID` did for free before the fold (stickler RF1, 2026-08-02).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("a reconnect resumes from the CLIENT's mark, not the server's delivered cursor", () => {
  test("rows lost in flight (terminal included) are re-delivered AND applied after the re-announce", async () => {
    const chatId = castId<ChatId>("chat_reconnect_barrier");
    // The durable log. Rows 1-3 reach the client; 4 (delta) + 5 (turnCompleted) are yielded into the dying
    // socket and never arrive; row 6 is another member's write, landing while this client is offline.
    const log: { readonly seq: number; readonly event: ChatBusEvent }[] = [
      { seq: 1, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "a" }, memberText: null } },
      { seq: 2, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "b" }, memberText: null } },
      { seq: 3, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "c" }, memberText: null } },
      { seq: 4, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "d" }, memberText: null } },
      { seq: 5, event: { type: "turnCompleted", chatId, intent: "send", messageId: null } },
    ];
    const replayChatEvents: ChatService["replayChatEvents"] = ({ afterSeq }) => Promise.resolve(log.filter((r) => r.seq > (afterSeq ?? 0)));
    const sockets: SocketRegistry = createSocketRegistry(() => 0);
    const socketId = nextSocket();
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents } },
      sockets,
    });
    const room = { channel: "chat", chatId } as const;

    // THE REAL client guard — the process singleton `use-chat-bus.ts` holds. Its `admit` is what decides
    // whether a re-offered row ever reaches the reducer, which is the only question this test asks.
    const guard = createChatEventSeqGuard();
    const applied: number[] = [];
    /** One frame arriving at the client: through the guard, then (if admitted) the reducer. */
    const receive = (frame: StreamFrame): void => {
      if (!(isChatFrame(frame) && guard.admit(frame.event, String(frame.seq)))) {
        return;
      }
      // The attach synthetics are admitted BY TYPE (they carry a non-advancing cursor) and invalidate
      // queries rather than touching the turn slot — the durable rows are what this test counts.
      if (!SYNTHETIC_TYPES.has(frame.event.type)) {
        applied.push(frame.seq);
      }
    };

    // ── socket #1: the server delivers 1..5; the client only ever receives 1..3 ──
    await caller(ctx).stream.attach({ socketId, ref: room, sinceSeq: 0 });
    const cell = sockets.adopt(MEMBER, socketId, null);
    const first = (await caller(ctx).stream.connect({ socketId })) as AsyncIterable<unknown>;
    const it1 = first[Symbol.asyncIterator]();
    for (let i = 0; i < 7; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      const frame = frameOf((await it1.next()).value);
      if (isChatFrame(frame) && frame.seq > 3) {
        continue; // rows 4,5 died in the dying socket's buffer: yielded by the server, never received
      }
      receive(frame);
    }
    await it1.return?.(undefined);

    expect(applied).toEqual([1, 2, 3]);
    expect(cell.rooms.get(`chat:${chatId}`)?.cursor).toBe(5); // the server counted what it handed the writer
    expect(guard.highWater(chatId)).toBe(3); // …the client counted what it applied

    // ── another member writes while we are offline ──
    log.push({ seq: 6, event: { type: "chatUpdated", chatId } });

    // ── socket #2: the reconnect. The barrier holds this room until the client announces. ──
    const second = (await caller(ctx).stream.connect({ socketId })) as AsyncIterable<unknown>;
    const it2 = second[Symbol.asyncIterator]();
    // ONE outstanding pull, raced against a timer and then REUSED below — a `next()` abandoned here would
    // never settle and `.return()` on a parked generator would hang with it.
    const parked = it2.next();
    const held = await Promise.race([parked.then(() => "delivered"), new Promise<string>((resolve) => setTimeout(() => resolve("held"), 60))]);
    // THE PIN: nothing at all — not the `attached` ack, not row 6 (which the pre-barrier code delivered from
    // cursor 5, jumping the client's mark to 6 and dooming the rewind's replay).
    expect(held).toBe("held");

    // ── the client's re-announce, carrying ITS mark (the `sinceSeq` thunk in `use-chat-bus.ts`) ──
    const mark = guard.highWater(chatId);
    expect(mark).toBe(3);
    await caller(ctx).stream.attach({ socketId, ref: room, ...(mark === null ? {} : { sinceSeq: mark }) });

    // The barrier lifts into a rewound pump: `attached` ack, chatOpened(3), then rows 4, 5, 6.
    receive(frameOf((await parked).value));
    for (let i = 0; i < 4; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      receive(frameOf((await it2.next()).value));
    }
    await it2.return?.(undefined);

    // The gap is APPLIED, not merely re-offered: rows 4 and 5 reached the reducer, so the turn's terminal
    // closes its slot and the composer's Stop clears. Row 6 (written while offline) rides in with them.
    expect(applied).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("the OVERLAP case: a reconnect that outruns the server's death-detection still holds, and the zombie cannot clobber the live cell", async () => {
    // THE HALF-OPEN TCP CLASS (§8's motivating one, and the barrier's primary trigger). A server learns a
    // socket died when a write to it fails; on a NAT rebind / sleep / dead proxy those writes BUFFER for
    // minutes, while the client gives up at 45s and reconnects. Two generators then share one cell, so:
    //   • the barrier cannot key on the predecessor's teardown having run (it has not) — it keys on the
    //     CONNECTION epoch, which the takeover bumps;
    //   • the zombie must stop producing (eviction), or it keeps advancing shared cursors into a dead pipe;
    //   • the zombie's eventual teardown must touch NOTHING — a cleared listener silences every room on the
    //     live socket, and a dark+timestamped cell is reap-eligible WHILE it is serving.
    const chatId = castId<ChatId>("chat_overlap");
    const log: { readonly seq: number; readonly event: ChatBusEvent }[] = [
      { seq: 1, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "a" }, memberText: null } },
      { seq: 2, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "b" }, memberText: null } },
      { seq: 3, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "c" }, memberText: null } },
      { seq: 4, event: { type: "delta", chatId, slotSeq: 1, delta: { chatId, kind: "text", text: "d" }, memberText: null } },
      { seq: 5, event: { type: "turnCompleted", chatId, intent: "send", messageId: null } },
    ];
    const replayChatEvents: ChatService["replayChatEvents"] = ({ afterSeq }) => Promise.resolve(log.filter((r) => r.seq > (afterSeq ?? 0)));
    const sockets: SocketRegistry = createSocketRegistry(() => 0);
    const socketId = nextSocket();
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents } },
      sockets,
    });
    const room = { channel: "chat", chatId } as const;
    const guard = createChatEventSeqGuard();
    const applied: number[] = [];
    const receive = (frame: StreamFrame): void => {
      if (!(isChatFrame(frame) && guard.admit(frame.event, String(frame.seq)))) {
        return;
      }
      if (!SYNTHETIC_TYPES.has(frame.event.type)) {
        applied.push(frame.seq);
      }
    };

    // ── socket #1: rows 1..5 yielded, only 1..3 received. It is then NEVER torn down. ──
    await caller(ctx).stream.attach({ socketId, ref: room, sinceSeq: 0 });
    const cell = sockets.adopt(MEMBER, socketId, null);
    const first = (await caller(ctx).stream.connect({ socketId })) as AsyncIterable<unknown>;
    const it1 = first[Symbol.asyncIterator]();
    for (let i = 0; i < 7; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      const frame = frameOf((await it1.next()).value);
      if (isChatFrame(frame) && frame.seq > 3) {
        continue;
      }
      receive(frame);
    }
    expect(applied).toEqual([1, 2, 3]);
    expect(cell.live).toBe(true);
    log.push({ seq: 6, event: { type: "chatUpdated", chatId } });

    // ── socket #2 connects while #1 is STILL LIVE (no `.return()`, no goDark) ──
    const second = (await caller(ctx).stream.connect({ socketId })) as AsyncIterable<unknown>;
    const it2 = second[Symbol.asyncIterator]();
    const parked = it2.next();
    const held = await Promise.race([parked.then(() => "delivered"), new Promise<string>((resolve) => setTimeout(() => resolve("held"), 60))]);
    // THE PIN: the barrier holds even though `goDark` never ran for the predecessor.
    expect(held).toBe("held");
    // …and the takeover EVICTED #1: its queue closed, so its generator has finished rather than pumping on.
    expect((await it1.next()).done).toBe(true);

    // ── the re-announce at the client's own mark ──
    await caller(ctx).stream.attach({ socketId, ref: room, sinceSeq: guard.highWater(chatId) ?? 0 });
    receive(frameOf((await parked).value));
    for (let i = 0; i < 4; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
      receive(frameOf((await it2.next()).value));
    }
    expect(applied).toEqual([1, 2, 3, 4, 5, 6]);

    // ── the zombie's teardown, arriving late (its `finally` already ran on eviction — assert the cell it
    //    left behind is the LIVE one, intact) ──
    expect(cell.live).toBe(true);
    expect(cell.lastSeenAt).toBeNull();
    expect(sockets.liveSocketCount(MEMBER)).toBe(1);

    // …and the live socket still serves: a NEW room attaches and gets its ack (a clobbered listener would
    // record the room and start nothing — silent, with no error anywhere).
    await caller(ctx).stream.attach({ socketId, ref: { channel: "rpg", chatId } });
    expect(frameOf((await it2.next()).value)).toEqual({ channel: "control", type: "attached", ref: { channel: "rpg", chatId } });
    await it2.return?.(undefined);
  });

  test("a live-only room does NOT wait for the announce — it has no cursor to be wrong about", async () => {
    // The barrier costs a round trip of freshness, so it is spent only where it buys something. `rpg`/`user`
    // carry no durable cursor: their recovery is the client's blanket invalidate, which a delay would only
    // postpone.
    const chatId = castId<ChatId>("chat_liveonly_barrier");
    const sockets: SocketRegistry = createSocketRegistry(() => 0);
    const socketId = nextSocket();
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
      sockets,
    });
    const call = caller(ctx);
    await call.stream.attach({ socketId, ref: { channel: "rpg", chatId } });
    const first = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const it1 = first[Symbol.asyncIterator]();
    await it1.next(); // the attached ack
    await it1.return?.(undefined);

    // RECONNECT with no re-announce at all: the room is pumping immediately.
    const second = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const it2 = second[Symbol.asyncIterator]();
    const frame = frameOf((await it2.next()).value);
    await it2.return?.(undefined);

    expect(frame).toEqual({ channel: "control", type: "attached", ref: { channel: "rpg", chatId } });
  });
});

// W7a — LOGOUT ENDS THE STREAM, COMPOSED. The registry suite proves the signal fires; this proves the thing
// the user actually experiences: the SSE generator for the signed-out device COMPLETES (so the client sees
// the close, reconnects, and its 401 reaches the recovery ladder), while the same human's other device keeps
// streaming. Before this, a revoked cookie left the socket running for the life of the connection.
describe("session eviction ends the live socket (W7a)", () => {
  test("evicting ONE session completes that socket's generator and leaves the sibling device's live", async () => {
    const chatId = castId<ChatId>("chat_evict_session");
    const sockets: SocketRegistry = createSocketRegistry(() => 0);
    const phoneSession = castId<SessionId>("sess_phone");
    const deskSession = castId<SessionId>("sess_desktop");

    const openDevice = async (sessionId: SessionId): Promise<AsyncIterator<unknown>> => {
      const socketId = nextSocket();
      const ctx = makeContext({
        auth: principal("user", { userId: MEMBER }),
        services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
        sockets,
        sessionId,
      });
      const call = caller(ctx);
      await call.stream.attach({ socketId, ref: { channel: "rpg", chatId } });
      const stream = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next(); // the attached ack — the socket is live and pumping
      return iterator;
    };

    const phone = await openDevice(phoneSession);
    const desktop = await openDevice(deskSession);
    expect(sockets.liveSocketCount(MEMBER)).toBe(2);

    // The logout route's edge, exactly as `entry/http/auth-routes.ts` fires it.
    const pending = phone.next();
    expect(sockets.evictSession(phoneSession)).toBe(1);

    // The signed-out device's stream ENDS (no frame, no error — a clean close the client reconnects from)…
    expect((await pending).done).toBe(true);
    // …and its cell darked through the generator's own ownership-checked teardown, so the counter is honest.
    expect(sockets.liveSocketCount(MEMBER)).toBe(1);

    // …while the desktop is still serving: a new room attaches and gets its ack on the SAME connection.
    await caller(
      makeContext({
        auth: principal("user", { userId: MEMBER }),
        services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
        sockets,
        sessionId: deskSession,
      }),
    ).stream.attach({ socketId: castId<SocketId>(`socket_composed_${socketSeq}`), ref: { channel: "user" } });
    expect(frameOf((await desktop.next()).value)).toEqual({ channel: "control", type: "attached", ref: { channel: "user" } });
    await desktop.return?.(undefined);
  });
});
