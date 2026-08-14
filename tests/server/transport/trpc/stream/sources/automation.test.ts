// The `automation` ROOM on the multiplexed socket (SSE-1 S4) — the per-chat automation feedback feed, MOVED
// here with its generator from `routers/automation.ts::stream`. The fold is SERVER-ONLY (the channel is the
// sanctioned-dormant DOORWAY, spec §14 PLUS: no client consumer yet), so these cases are the only thing
// standing between the moved body and a silent behavior change.
//
// The four properties that came with it, none of which had a transport-tier test before the move:
//   • REFUSE AT ATTACH — `resolveStreamAuthority` throws AutomationChatNotFound for a non-present member, so
//     the room reads as nonexistent. This is the deliberate ASYMMETRY against chat/rpg (which accept-always
//     and withhold): those rooms may legitimately be attached before they exist; an automation room may not.
//   • THE TIER PROJECTION — a `member` subscriber receives ONLY the room-visible `quickReplySurfaced` chips;
//     rule fire/error/disable/config-change are the host's hidden hand.
//   • EPHEMERAL, NO REWIND — the bus has no durable half, so a `sinceSeq` attach replays nothing and the
//     frames carry no `seq` (the socket therefore never advances a cursor for this room). It is the
//     `resumable: false` half of the correspondence pinned in `../room-sources.test.ts`.
//   • THE GATE RE-RUNS IN THE PUMP (that is where the tier comes from), and a throw there is a per-ROOM
//     `roomFailed` frame — the socket and every other room survive it.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { StreamFrame } from "@orb/contracts/stream";
import { DomainUnavailableError } from "@orb/kit/errors";
import type { AutomationRuleId, ChatId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AutomationService } from "@orb/server/domain/automation";
import { AutomationChatNotFoundError } from "@orb/server/domain/automation";
import type { Context } from "@orb/server/transport/trpc";
import { createSocketRegistry, publishAutomationEvent, publishUserEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../../_support.ts";

const MEMBER = castId<UserId>("user_automation_member");
const CHAT = castId<ChatId>("chat_automation_1");
const RULE = castId<AutomationRuleId>("automationrule_1");

const CHIPS: AutomationBusEvent = {
  type: "quickReplySurfaced",
  chatId: CHAT,
  source: { kind: "rule", ruleId: RULE },
  choices: [{ label: "Flee", sendText: "I run" }],
};
const HOST_ONLY: AutomationBusEvent = { type: "ruleFired", chatId: CHAT, ruleId: RULE };

/** A fresh socketId per attach. The registry is per-Context (isolated), but the automation bus is
 *  process-local, so a distinct id keeps a stray publish from a prior test out of this one's frames. */
let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_automation_${socketSeq}`);
}

function ctxWith(automation: Partial<AutomationService>): Context {
  return makeContext({ auth: principal("user", { userId: MEMBER }), services: { automation } });
}

/** The tracked envelope's parts (`[ordinal, frame, symbol]` on the server side of `createCaller`). */
function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}

/** Attach the automation room, connect, and drain the `attached` ack — leaving an iterator parked exactly
 *  where the deleted `automation.stream` subscription's iterator started. */
async function openAutomationRoom(ctx: Context, opts: { readonly sinceSeq?: number } = {}): Promise<AsyncIterator<unknown>> {
  const socketId = nextSocket();
  const call = caller(ctx);
  await call.stream.attach({ socketId, ref: { channel: "automation", chatId: CHAT }, ...(opts.sinceSeq === undefined ? {} : { sinceSeq: opts.sinceSeq }) });
  const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
  const iterator = socket[Symbol.asyncIterator]();
  const ack = await iterator.next();
  expect(frameOf(ack.value)).toEqual({ channel: "control", type: "attached", ref: { channel: "automation", chatId: CHAT } });
  return iterator;
}

/** Park the pump in its live loop, publish, and take the next frame. The park matters: `resolveStreamAuthority`
 *  is awaited BEFORE the bus tail attaches (the pre-fold ordering, preserved), so publishing too early is a
 *  race the real feed has too. */
async function nextFrameAfter(iterator: AsyncIterator<unknown>, publish: () => void): Promise<StreamFrame> {
  const pending = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));
  publish();
  return frameOf((await pending).value);
}

describe("the automation room refuses at attach — the asymmetry against chat/rpg", () => {
  test("a NON-present member is refused NOT_FOUND, and no room is recorded on the socket", async () => {
    const socketId = nextSocket();
    const sockets = createSocketRegistry(() => 0);
    const resolveStreamAuthority = vi.fn<AutomationService["resolveStreamAuthority"]>(() => Promise.reject(new AutomationChatNotFoundError(CHAT)));
    const call = caller(makeContext({ auth: principal("user", { userId: MEMBER }), services: { automation: { resolveStreamAuthority } }, sockets }));

    // The verdict the deleted subscription gave on its first pull, now given at attach — before any bus tail
    // and before the socket cell knows the room exists. A stranger never learns the chat is real.
    await expect(call.stream.attach({ socketId, ref: { channel: "automation", chatId: CHAT } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(resolveStreamAuthority).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: MEMBER }), chatId: CHAT });

    // The refusal is REAL, not merely a thrown error beside a recorded room: the cell holds nothing, so a
    // later connect (or a reconnect) can never re-hydrate a pump for it.
    expect(sockets.adopt(MEMBER, socketId, null).rooms.size).toBe(0);
  });
});

describe("the tier projection — the host's hidden hand stays hidden", () => {
  test("a `member` subscriber receives the room-visible chips", async () => {
    const iterator = await openAutomationRoom(ctxWith({ resolveStreamAuthority: () => Promise.resolve("member") }));
    const frame = await nextFrameAfter(iterator, () => publishAutomationEvent(CHIPS));
    await iterator.return?.(undefined);

    // The bus event rides VERBATIM under `event` (the nesting rule) and carries NO `seq` — this room is
    // live-only, so the socket has no cursor to advance for it.
    expect(frame).toEqual({ channel: "automation", chatId: CHAT, event: CHIPS });
  });

  test("a `member` subscriber never receives a host-only event — it is elided, not merely unrendered", async () => {
    const iterator = await openAutomationRoom(ctxWith({ resolveStreamAuthority: () => Promise.resolve("member") }));
    const frame = await nextFrameAfter(iterator, () => {
      publishAutomationEvent(HOST_ONLY); // rule fire/error/disable/config-change: the host's hidden hand
      publishAutomationEvent(CHIPS);
    });
    await iterator.return?.(undefined);

    // The FIRST frame after the ack is the chips one — `ruleFired` was filtered out inside the pump.
    expect(frame).toEqual({ channel: "automation", chatId: CHAT, event: CHIPS });
  });

  test("a `host` subscriber receives the host-only events too", async () => {
    const iterator = await openAutomationRoom(ctxWith({ resolveStreamAuthority: () => Promise.resolve("host") }));
    const frame = await nextFrameAfter(iterator, () => publishAutomationEvent(HOST_ONLY));
    await iterator.return?.(undefined);

    expect(frame).toEqual({ channel: "automation", chatId: CHAT, event: HOST_ONLY });
  });
});

describe("ephemeral by design — there is no rewind arm", () => {
  test("a `sinceSeq` attach replays NOTHING and goes straight live (no durable row exists to re-read)", async () => {
    const resolveStreamAuthority = vi.fn<AutomationService["resolveStreamAuthority"]>(() => Promise.resolve("host"));
    // `sinceSeq: 0` is the strongest replay request a client can make — a durable room would re-send its whole
    // log for it. This room has no log: the cursor is accepted and ignored.
    const iterator = await openAutomationRoom(ctxWith({ resolveStreamAuthority }), { sinceSeq: 0 });
    const frame = await nextFrameAfter(iterator, () => publishAutomationEvent(CHIPS));
    await iterator.return?.(undefined);

    // The first frame after the ack is the LIVE arrival, not a replayed one — and it carries no `seq`.
    expect(frame).toEqual({ channel: "automation", chatId: CHAT, event: CHIPS });
    expect(frame).not.toHaveProperty("seq");
  });
});

describe("the pump re-runs the gate, and its throw is one room's fault", () => {
  test("a failing authority resolve becomes roomFailed and the socket's other room survives", async () => {
    const socketId = nextSocket();
    // Accept the ATTACH, then fail inside the pump — which is exactly the shape of a membership read that
    // breaks (or a member kicked) between the attach and the pump start / a reconnect.
    const resolveStreamAuthority = vi
      .fn<AutomationService["resolveStreamAuthority"]>()
      .mockResolvedValueOnce("host")
      .mockRejectedValue(new DomainUnavailableError("automation authority read unavailable"));
    const call = caller(ctxWith({ resolveStreamAuthority }));
    await call.stream.attach({ socketId, ref: { channel: "automation", chatId: CHAT } });
    await call.stream.attach({ socketId, ref: { channel: "user" } });

    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    const iterator = socket[Symbol.asyncIterator]();
    const frames: StreamFrame[] = [];
    const first = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    publishUserEvent(MEMBER, { type: "tagsChanged" });
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
      ref: { channel: "automation", chatId: CHAT },
      code: "SERVICE_UNAVAILABLE",
      message: "automation authority read unavailable",
    });
    expect(frames).toContainEqual({ channel: "control", type: "detached", ref: { channel: "automation", chatId: CHAT } });
    // The socket is ALIVE: the unrelated room's event still arrives.
    expect(frames).toContainEqual({ channel: "user", event: { type: "tagsChanged" } });
  });
});
