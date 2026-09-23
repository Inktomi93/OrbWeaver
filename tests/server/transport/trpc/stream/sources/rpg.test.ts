// The `rpg` ROOM on the multiplexed socket (SSE-1 §4.2) — the per-game live event relay, MOVED verbatim from
// `routers/rpg.ts::stream`. It was the ONE folded room with no transport-tier test, which is why this file
// exists: the property that actually protects a game's events is not a gate at attach, it is the PER-YIELD
// membership probe inside the pump, and an unpinned belt is a belt nobody would notice going away.
//
// THE POSTURE, pinned as it is (#1408, re-derived 2026-09-04): `authorizeAttach` ACCEPTS ALWAYS and the pump
// withholds — the same asymmetry `chat` carries and `automation`/`workloads` deliberately do not
// (`stream/room-source.ts`: "'Refuse at attach' vs 'accept-and-withhold' is preserved PER CHANNEL"). Accepting
// always is NOT an existence oracle: the attach verdict is IDENTICAL for a member, a stranger, and a chatId
// that names nothing, so a caller learns exactly nothing by attaching. What it costs is a listener plus one
// membership read per event for a room the caller cannot read — bounded by `ROOMS_PER_SOCKET` (32) ×
// `SOCKETS_PER_USER` (8), not unbounded.
//
// What the cases below prove, in the order the source's header claims it:
//   • accept-always is UNIFORM and asks NOTHING at attach (so it cannot answer anything either);
//   • the probe runs PER EVENT: a refused verdict withholds that event without failing the room, and a
//     membership lost MID-STREAM (a kick) stops delivery from the next event on.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { StreamFrame } from "@orb/contracts/stream";
import type { SocketId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { publishRpgEvent } from "@orb/server/domain/rpg";
import type { Context } from "@orb/server/transport/trpc";
import { createSocketRegistry } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../../_support.ts";

// MINTED, never readable literals: these ids cross `typeIdSchema` tRPC inputs, which validate the TypeID suffix.
const ID = {
  chatRpg1: mintTypeId(ID_PREFIX.chat),
} as const;

const MEMBER = castId<UserId>("user_rpg_member");
const CHAT = ID.chatRpg1;
/** The unclamped attach probe a member resolves (`chat.chatEventBounds`). This room reads only its SUCCESS,
 *  never its fields: an rpg event carries no canon anchor, so there is no floor arm here. */
const BOUNDS = { minSeq: 1, maxSeq: 3, historyFloorSeq: 0, viewerIsHost: false, reasoningHostOnly: false };

const GAME_CHANGED: RpgBusEvent = { type: "gameChanged", chatId: CHAT };
const QUEST_CHANGED: RpgBusEvent = { type: "questChanged", chatId: CHAT };

/** A fresh socketId per attach — the rpg bus is process-local module state, so a distinct id keeps a stray
 *  publish from a prior test out of this one's frames. */
let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_rpg_${socketSeq}`);
}

function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}

/** The rpg DATA frame's event (throws on a control frame, so a `roomFailed` can never read as a withhold). */
function eventOf(result: IteratorResult<unknown>): RpgBusEvent {
  const frame = frameOf(result.value);
  if (frame.channel !== "rpg") {
    throw new Error(`expected an rpg frame, got ${frame.channel}${frame.channel === "control" ? `/${frame.type}` : ""}`);
  }
  return frame.event;
}

function ctxWith(chatEventBounds: ChatService["chatEventBounds"]): Context {
  return makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { chatEventBounds } } });
}

/** Attach the rpg room, connect, and drain the `attached` ack — the iterator is then parked exactly where the
 *  deleted `rpg.stream` subscription's was. */
async function openRpgRoom(ctx: Context): Promise<AsyncIterator<unknown>> {
  const socketId = nextSocket();
  const call = caller(ctx);
  await call.stream.attach({ socketId, ref: { channel: "rpg", chatId: CHAT } });
  const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
  const iterator = socket[Symbol.asyncIterator]();
  const ack = await iterator.next();
  expect(frameOf(ack.value)).toEqual({ channel: "control", type: "attached", ref: { channel: "rpg", chatId: CHAT } });
  return iterator;
}

describe("the rpg room accepts every attach — uniformly, so the accept carries no information", () => {
  test("a NON-member's attach is accepted exactly like a member's, and it asks the membership question at all", async () => {
    const sockets = createSocketRegistry(() => 0);
    // The probe REFUSES this caller for this chat — a stranger, or a chatId that names nothing at all.
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() => Promise.reject(new ChatNotFoundError(CHAT)));
    const socketId = nextSocket();
    const call = caller(makeContext({ auth: principal("user", { userId: MEMBER }), services: { chat: { chatEventBounds } }, sockets }));

    await expect(call.stream.attach({ socketId, ref: { channel: "rpg", chatId: CHAT } })).resolves.toBeUndefined();
    expect(sockets.adopt(MEMBER, socketId, null).rooms.size).toBe(1);
    // NOT an oracle: the attach never asked the question, so its answer cannot be read off the response.
    // (The `workloads`/`notifications` rooms refuse here instead — that asymmetry is per-channel and ruled.)
    expect(chatEventBounds).not.toHaveBeenCalled();
  });
});

describe("the per-yield membership probe is what protects the game's events", () => {
  test("an event is WITHHELD while the probe refuses and DELIVERED while it admits — per event, so a kick cuts the stream mid-flight", async () => {
    // The verdicts, in probe order: not-a-member → member → kicked → re-admitted. Each maps to ONE published
    // event, so the frames that arrive are exactly the admitted ones.
    const verdicts = [false, true, false, true];
    let call = 0;
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() => {
      const allowed = verdicts[call] ?? false;
      call += 1;
      return allowed ? Promise.resolve(BOUNDS) : Promise.reject(new ChatNotFoundError(CHAT));
    });
    const iterator = await openRpgRoom(ctxWith(chatEventBounds));

    // Park the pump in its live loop before publishing (the bus tail attaches inside the pump — publishing
    // ahead of the park is the same race the real feed has).
    const firstYield = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    publishRpgEvent(GAME_CHANGED); // probe 1: NOT a member — withheld, and the room does NOT fail
    publishRpgEvent(QUEST_CHANGED); // probe 2: a member — delivered
    const first = await firstYield;

    const secondYield = iterator.next();
    publishRpgEvent(GAME_CHANGED); // probe 3: KICKED between events — withheld
    publishRpgEvent(QUEST_CHANGED); // probe 4: re-admitted — delivered
    const second = await secondYield;
    await iterator.return?.(undefined);

    // Only the admitted events crossed: the two `gameChanged` publishes are gone, silently (a refusal is
    // silence, never a `roomFailed` — `eventOf` would throw on a control frame).
    expect(eventOf(first)).toEqual(QUEST_CHANGED);
    expect(eventOf(second)).toEqual(QUEST_CHANGED);
    // FOUR probes for FOUR events — the gate is per-yield, never a single attach-time verdict.
    expect(chatEventBounds).toHaveBeenCalledTimes(4);
    expect(chatEventBounds).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: MEMBER }), chatId: CHAT });
  });
});
