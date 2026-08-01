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

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { StreamDataFrame, StreamFrame } from "@orb/contracts/stream";
import type { ChatId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import type { SocketRegistry } from "@orb/server/transport/trpc";
import { createSocketRegistry, FRAME_QUEUE_CAPACITY, publishChatEvent } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");

let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_composed_${socketSeq}`);
}

/** The member-gated attach probe — an unclamped MEMBER (the arm every assertion here is about delivery, not
 *  projection). `maxSeq` is generous so no truncation synthesis fires. */
const bounds: ChatService["chatEventBounds"] = () =>
  Promise.resolve({ minSeq: 1, maxSeq: 10_000, historyFloorSeq: 0, viewerIsHost: true, reasoningHostOnly: false });

function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}
function isChatFrame(frame: StreamFrame): frame is Extract<StreamDataFrame, { channel: "chat" }> {
  return frame.channel === "chat";
}

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
    const cell = sockets.adopt(MEMBER, socketId);

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
    const cell = sockets.adopt(MEMBER, socketId);

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
});
