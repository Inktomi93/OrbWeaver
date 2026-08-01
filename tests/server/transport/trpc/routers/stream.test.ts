// The multiplexed socket, driven through the REAL ladder (`createCaller` over a fake `Services`) — the
// `rpg.stream` relay tests this file replaces, plus the properties that only exist now that N rooms share
// one connection.
//
// What moved verbatim from `routers/rpg.test.ts` (the fold changed NO authorization verdict):
//   • a member's bus event is relayed, with the per-yield `chatEventBounds` membership probe run first;
//   • a DomainError escaping that probe becomes a TYPED frame, never a raw 500 (an unwrapped subscription
//     throw is a retryable tRPC 500 that `httpSubscriptionLink` silently reconnects forever with zero client
//     callbacks — the 2026-08-01 zombie-subscription incident).
// What is NEW and is the reason the fold is worth doing:
//   • that typed failure is now a per-ROOM `roomFailed` control frame — the socket and every OTHER room
//     survive it, where before the whole stream ended;
//   • two rooms genuinely multiplex over ONE connection;
//   • EVERY channel in the wire vocabulary is a real room (S4 closed the fold), so there is no longer any
//     room reachable by two transports — nor a placeholder that refuses because its procedure still exists.

import type { StreamFrame, StreamRoomRef } from "@orb/contracts/stream";
import { STREAM_CHANNELS } from "@orb/contracts/stream";
import { DomainNotFoundError, DomainUnavailableError } from "@orb/kit/errors";
import type { ChatId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { publishRpgEvent } from "@orb/server/domain/rpg";
import type { Context, PresenceRegistry, SocketRegistry } from "@orb/server/transport/trpc";
import { createPresenceRegistry, createSocketRegistry, publishUserEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");
const STRANGER = castId<UserId>("user_stranger");
const CHAT = castId<ChatId>("chat_stream_1");

/** A fresh socketId per test. The registry is per-Context (isolated), but the buses are process-local, so a
 *  distinct id keeps a stray publish from a prior test out of this one's frames. */
let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_test_${socketSeq}`);
}

const seated: ChatService["chatEventBounds"] = () =>
  Promise.resolve({ minSeq: 0, maxSeq: 0, historyFloorSeq: 0, viewerIsHost: true, reasoningHostOnly: false });

function ctxWith(chatEventBounds: ChatService["chatEventBounds"], userId: UserId = MEMBER, sockets?: SocketRegistry): Context {
  return makeContext({
    auth: principal("user", { userId }),
    services: { chat: { chatEventBounds } },
    ...(sockets === undefined ? {} : { sockets }),
  });
}

/** The tracked envelope's parts (`[id, data, symbol]` on the server side of `createCaller`). */
function idOf(yielded: unknown): string {
  return (Array.isArray(yielded) ? yielded[0] : "") as string;
}
function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}

/** Pull frames off a live socket until `count` have arrived, publishing via `drive` once the pumps are up. */
async function collect(socket: AsyncIterable<unknown>, count: number, drive: () => void): Promise<StreamFrame[]> {
  const iterator = socket[Symbol.asyncIterator]();
  // The first pull starts the generator (its setup slice runs synchronously), THEN the events fire — so the
  // pumps are attached before anything is published and nothing races into a gap.
  const first = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));
  drive();
  const frames: StreamFrame[] = [frameOf((await first).value)];
  for (let i = 1; i < count; i++) {
    // biome-ignore lint/performance/noAwaitInLoops: reading a stream is inherently sequential.
    const result = await iterator.next();
    frames.push(frameOf(result.value));
  }
  // Never leave a `next()` outstanding here — `.return()` on a parked generator never settles.
  await iterator.return?.(undefined);
  return frames;
}

describe("one socket, N rooms", () => {
  test("attach-before-connect: the socket re-hydrates the room and relays its events", async () => {
    const socketId = nextSocket();
    const call = caller(ctxWith(seated));
    await call.stream.attach({ socketId, ref: { channel: "user" } });

    const socket = await call.stream.connect({ socketId });
    const frames = await collect(socket as AsyncIterable<unknown>, 2, () => publishUserEvent(MEMBER, { type: "tagsChanged" }));

    expect(frames[0]).toEqual({ channel: "control", type: "attached", ref: { channel: "user" } });
    expect(frames[1]).toEqual({ channel: "user", event: { type: "tagsChanged" } });
  });

  test("attach AFTER connect reaches the live socket, and its frames ride the same connection", async () => {
    const socketId = nextSocket();
    const call = caller(ctxWith(seated));
    const socket = await call.stream.connect({ socketId });

    const frames = await collect(socket as AsyncIterable<unknown>, 2, () => {
      void call.stream.attach({ socketId, ref: { channel: "rpg", chatId: CHAT } }).then(() => {
        publishRpgEvent({ type: "gameChanged", chatId: CHAT });
      });
    });

    expect(frames[0]).toEqual({ channel: "control", type: "attached", ref: { channel: "rpg", chatId: CHAT } });
    expect(frames[1]).toEqual({ channel: "rpg", chatId: CHAT, event: { type: "gameChanged", chatId: CHAT } });
  });

  test("TWO rooms multiplex over ONE socket — this is the whole point", async () => {
    const socketId = nextSocket();
    const call = caller(ctxWith(seated));
    await call.stream.attach({ socketId, ref: { channel: "user" } });
    await call.stream.attach({ socketId, ref: { channel: "rpg", chatId: CHAT } });

    const socket = await call.stream.connect({ socketId });
    const frames = await collect(socket as AsyncIterable<unknown>, 4, () => {
      publishUserEvent(MEMBER, { type: "tagsChanged" });
      publishRpgEvent({ type: "gameChanged", chatId: CHAT });
    });

    expect(frames.filter((f) => f.channel === "user")).toHaveLength(1);
    expect(frames.filter((f) => f.channel === "rpg")).toHaveLength(1);
  });

  test("the wire id is a per-socket ORDINAL, never a cursor", async () => {
    const socketId = nextSocket();
    const call = caller(ctxWith(seated));
    await call.stream.attach({ socketId, ref: { channel: "user" } });

    const socket = await call.stream.connect({ socketId });
    const iterator = (socket as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    const first = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    publishUserEvent(MEMBER, { type: "tagsChanged" });
    const one = await first;
    const two = await iterator.next();
    await iterator.return?.(undefined);

    expect(idOf(one.value)).toBe("1");
    expect(idOf(two.value)).toBe("2");
  });
});

describe("the rpg room's authority is the relay's, verbatim", () => {
  test("the per-yield membership probe runs for THIS caller on THIS chat before anything is relayed", async () => {
    const socketId = nextSocket();
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(seated);
    const call = caller(ctxWith(chatEventBounds));
    await call.stream.attach({ socketId, ref: { channel: "rpg", chatId: CHAT } });

    const socket = await call.stream.connect({ socketId });
    await collect(socket as AsyncIterable<unknown>, 2, () => publishRpgEvent({ type: "gameChanged", chatId: CHAT }));

    expect(chatEventBounds).toHaveBeenCalledWith(expect.objectContaining({ principal: expect.objectContaining({ userId: MEMBER }), chatId: CHAT }));
  });

  test("a NON-MEMBER attaches successfully and simply receives nothing (withhold, never a refusal)", async () => {
    const socketId = nextSocket();
    const notSeated = (): Promise<never> => Promise.reject(new DomainNotFoundError("chat", CHAT));
    const call = caller(ctxWith(notSeated, STRANGER));

    // Accept-always at attach is DELIBERATE: a game may be born while a client is attached, and refusing
    // here would be an existence oracle.
    await expect(call.stream.attach({ socketId, ref: { channel: "rpg", chatId: CHAT } })).resolves.toBeUndefined();

    const socket = await call.stream.connect({ socketId });
    const frames = await collect(socket as AsyncIterable<unknown>, 1, () => publishRpgEvent({ type: "gameChanged", chatId: CHAT }));
    // Only the attach ack — the event was withheld by the per-yield gate.
    expect(frames).toEqual([{ channel: "control", type: "attached", ref: { channel: "rpg", chatId: CHAT } }]);
  });
});

describe("per-room fault isolation (the property that did not exist before)", () => {
  test("a throwing pump becomes roomFailed and the SOCKET keeps delivering its other room", async () => {
    const socketId = nextSocket();
    // Not the leak-free NOT_FOUND (that one withholds) — any OTHER domain failure of the probe.
    const broken = (): Promise<never> => Promise.reject(new DomainUnavailableError("chat read unavailable"));
    const call = caller(ctxWith(broken));
    await call.stream.attach({ socketId, ref: { channel: "rpg", chatId: CHAT } });
    await call.stream.attach({ socketId, ref: { channel: "user" } });

    const socket = await call.stream.connect({ socketId });
    const frames = await collect(socket as AsyncIterable<unknown>, 5, () => {
      publishRpgEvent({ type: "gameChanged", chatId: CHAT });
      publishUserEvent(MEMBER, { type: "tagsChanged" });
    });

    expect(frames).toContainEqual({
      channel: "control",
      type: "roomFailed",
      ref: { channel: "rpg", chatId: CHAT },
      code: "SERVICE_UNAVAILABLE",
      message: "chat read unavailable",
    });
    // The socket is ALIVE: the unrelated room's event still arrives, and the failed room is detached.
    expect(frames).toContainEqual({ channel: "user", event: { type: "tagsChanged" } });
    expect(frames).toContainEqual({ channel: "control", type: "detached", ref: { channel: "rpg", chatId: CHAT } });
  });
});

describe("the staged fold leaves no dual transport", () => {
  /** One ref per ROOM channel — the list is asserted total against `STREAM_CHANNELS` below, so a new channel
   *  cannot quietly skip this pin. */
  const allRooms: readonly StreamRoomRef[] = [
    { channel: "user" },
    { channel: "notifications" },
    { channel: "chat", chatId: CHAT },
    { channel: "rpg", chatId: CHAT },
    { channel: "automation", chatId: CHAT },
  ];

  test("EVERY channel is a real room now — S4 closed the fold, and no placeholder refusal is left", async () => {
    const socketId = nextSocket();
    // An authorized caller for each room's own gate: a seated chat member (chat/rpg), a multi-human
    // deployment (notifications), a present automation member. Each room's REFUSAL posture is pinned in its
    // own source test; what this pins is that none of them refuses merely because it has not folded.
    const call = caller(
      makeContext({
        auth: principal("user", { userId: MEMBER }),
        services: { chat: { chatEventBounds: seated }, automation: { resolveStreamAuthority: () => Promise.resolve("member") } },
      }),
    );

    expect(new Set(allRooms.map((ref) => ref.channel))).toEqual(new Set(STREAM_CHANNELS));
    const attached = await Promise.all(allRooms.map((ref) => call.stream.attach({ socketId, ref })));

    expect(attached).toEqual(allRooms.map(() => undefined));
  });

  test("detach is idempotent — tearing down a room the server already dropped is not an error", async () => {
    const socketId = nextSocket();
    const call = caller(ctxWith(seated));

    await expect(call.stream.detach({ socketId, ref: { channel: "user" } })).resolves.toBeUndefined();
  });
});

describe("the socket is bound to one principal", () => {
  test("connecting with another user's socketId is a leak-free NOT_FOUND, not a hijack", async () => {
    const socketId = nextSocket();
    // ONE registry, two principals — the only shape in which a hijack is even expressible.
    const sockets = createSocketRegistry(() => 0);
    await caller(ctxWith(seated, MEMBER, sockets)).stream.attach({ socketId, ref: { channel: "user" } });

    await expect(caller(ctxWith(seated, STRANGER, sockets)).stream.connect({ socketId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // …and the refusal is a refusal, not a silently-forked second cell: nothing of Alice's went live.
    expect(sockets.liveSocketCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRESENCE + THE HOST-RETURN DRAIN — moved onto the socket at S3 (spec §5.6, owner-ruled §14.4). They used
// to ride `notifications.notifications`, which meant device liveness was gated by the PD-106 multi-human
// belt: a deployment that refused the notifications router registered NO presence at all, and cast-gating
// read every user as offline. The socket is `authedProcedure`, so the ref-count is now the tab's, full stop.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the socket owns presence (S3)", () => {
  /** A context with a REAL presence registry (a fixed clock — the grace window has its own slice test) plus
   *  the chat verb the host-return edge fires. */
  function presenceCtx(drainDeferredTurns: ChatService["drainDeferredTurns"], multiHumanCapable = true): { ctx: Context; presence: PresenceRegistry } {
    const presence = createPresenceRegistry(() => 0);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: seated, drainDeferredTurns } },
      presence,
      multiHumanCapable,
    });
    return { ctx, presence };
  }

  const emptyDrain: ChatService["drainDeferredTurns"] = () => Promise.resolve({ ran: 0, dropped: 0 });

  test("connecting ref-counts the caller's device liveness", async () => {
    const { ctx, presence } = presenceCtx(emptyDrain);
    expect(presence.read(MEMBER).online).toBe(false);

    await caller(ctx).stream.connect({ socketId: nextSocket() });

    expect(presence.read(MEMBER).online).toBe(true);
  });

  test("presence is NOT gated by the multi-human belt any more — the behavior change the owner took", async () => {
    // The point of the move: on a single-user deployment the notifications router was refused wholesale, so
    // nothing ever called `presence.connect` and cast-gating saw the host as offline forever.
    const { ctx, presence } = presenceCtx(emptyDrain, false);

    await caller(ctx).stream.connect({ socketId: nextSocket() });

    expect(presence.read(MEMBER).online).toBe(true);
  });

  test("the offline→online edge drains the turns that deferred while the host was dark", async () => {
    const drain = vi.fn<ChatService["drainDeferredTurns"]>(emptyDrain);
    const { ctx } = presenceCtx(drain);

    await caller(ctx).stream.connect({ socketId: nextSocket() });

    expect(drain).toHaveBeenCalledWith({ hostUserId: MEMBER });
  });

  test("a SECOND live socket does not re-drain — the edge is offline→online, not per-connection", async () => {
    const drain = vi.fn<ChatService["drainDeferredTurns"]>(emptyDrain);
    const { ctx } = presenceCtx(drain);

    await caller(ctx).stream.connect({ socketId: nextSocket() });
    await caller(ctx).stream.connect({ socketId: nextSocket() });

    expect(drain).toHaveBeenCalledTimes(1);
  });
});
