// The `chat` ROOM on the multiplexed socket (SSE-1 S2) — the per-chat room-public event stream, MOVED here
// with its generator from `routers/chat.ts::streamMessages` (these cases came with it, unchanged in what
// they assert; only the wire moved: the durable resume cursor rides `frame.seq` instead of the tracked
// envelope id, which is now a per-socket ordinal).
//
// Load-bearing: on RESUME (`sinceSeq`) the room replays the durable `chat_events` rows with `seq > cursor`
// (via the member-gated `chat.replayChatEvents`) BEFORE draining live; the membership gate WITHHOLDS-not-
// throws (a NOT_FOUND probe yields nothing and keeps the room attached — the draft-tolerant attach + the
// kicked-member cutoff), and the per-yield gate runs on EVERY live event. Driven through the real ladder via
// `createCaller` (stream.attach → stream.connect); the live bus is transport module state.
//
// NEW HERE AND NOWHERE ELSE (§5.5): the TWO-ROOM SCRUB ISOLATION property. Under one-subscription-per-chat,
// "one room's deception verdict cannot touch another room's bytes" was structural. Under the multiplex it is
// guaranteed by the scrub state being allocated INSIDE the pump — weaker-looking, therefore tested: one
// principal, one socket, two chats, ONE deception-active.

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import type { StreamDataFrame, StreamFrame } from "@orb/contracts/stream";
import type { ChatId, SocketId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import type { Context } from "@orb/server/transport/trpc";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../../_support.ts";

const MEMBER = castId<UserId>("user_member");
const CHAT = castId<ChatId>("chat_1");
// `historyFloorSeq: 0` = the UNCLAMPED probe (a host / a `full` member / any born-here seat) — the arm every
// pre-D16 assertion in this file was written against, so the clamp is provably invisible to it.
const BOUNDS = { minSeq: 1, maxSeq: 3, historyFloorSeq: 0, viewerIsHost: false, reasoningHostOnly: false };

/** A fresh socketId per attach. The registry is per-Context (isolated), but the chat bus is process-local,
 *  so a distinct id keeps a stray publish from a prior test out of this one's frames. */
let socketSeq = 0;
function nextSocket(): SocketId {
  socketSeq += 1;
  return castId<SocketId>(`socket_chat_${socketSeq}`);
}

/** Two interchangeable id-only DURABLE members, so an arm can tell "this frame" from "that frame" without
 *  caring what either means. `chatDeleted` used to be the second one and can no longer be: it is live-only
 *  now, and — the reason a swap was not optional — it BYPASSES the per-yield member gate (fork F-A), so the
 *  withhold arm below would have been quietly asserting the opposite of what it says. */
const event = (type: "chatUpdated" | "chatCreated" = "chatUpdated", chatId: ChatId = CHAT): ChatBusEvent => ({
  type,
  chatId,
});

/** The tracked envelope's parts (`[ordinal, frame, symbol]` on the server side of `createCaller`). */
function frameOf(yielded: unknown): StreamFrame {
  return (Array.isArray(yielded) ? yielded[1] : yielded) as StreamFrame;
}
/** One pulled `chat` DATA frame — the durable resume cursor now rides the FRAME, not the envelope id. */
function chatFrame(result: IteratorResult<unknown>): Extract<StreamDataFrame, { channel: "chat" }> {
  const frame = frameOf(result.value);
  if (frame.channel !== "chat") {
    throw new Error(`expected a chat frame, got ${frame.channel}${frame.channel === "control" ? `/${frame.type}` : ""}`);
  }
  return frame;
}
function dataOf(result: IteratorResult<unknown>): ChatBusEvent {
  return chatFrame(result).event;
}
function seqOf(result: IteratorResult<unknown>): number {
  return chatFrame(result).seq;
}

/** Attach the chat room, connect the socket, and drain the `attached` control ack — leaving an iterator
 *  parked exactly where the old `chat.streamMessages` subscription's iterator started. */
async function openChatRoom(ctx: Context, opts: { readonly chatId?: ChatId; readonly sinceSeq?: number } = {}): Promise<AsyncIterator<unknown>> {
  const socketId = nextSocket();
  const chatId = opts.chatId ?? CHAT;
  const call = caller(ctx);
  await call.stream.attach({ socketId, ref: { channel: "chat", chatId }, ...(opts.sinceSeq === undefined ? {} : { sinceSeq: opts.sinceSeq }) });
  const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
  const iterator = socket[Symbol.asyncIterator]();
  const ack = await iterator.next();
  expect(frameOf(ack.value)).toEqual({ channel: "control", type: "attached", ref: { channel: "chat", chatId } });
  return iterator;
}

describe("the chat room — durable-first resume", () => {
  test("replays durable rows newer than the cursor, ascending, before going live (after the chatOpened attach synthesis)", async () => {
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async ({ afterSeq }) => [
      { seq: (afterSeq ?? 0) + 1, event: event("chatCreated") },
      { seq: (afterSeq ?? 0) + 2, event: event() },
    ]);
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx, { sinceSeq: 5 });
    // PD-134: `chatOpened` synthesizes FIRST at attach, carrying the resume cursor as its frame seq (never
    // advancing it — a reconnect resumes from the same durable point).
    const opened = await iterator.next();
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened).type).toBe("chatOpened");
    expect(seqOf(opened)).toBe(5);
    // The durable replay ran with the resume cursor, member-gated…
    expect(replayChatEvents).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      afterSeq: 5,
    });
    // …and the missed events replay ASCENDING with their durable seq as the frame cursor (no
    // `historyTruncated`: cursor 5 is INSIDE the retained window minSeq=1).
    expect(seqOf(first)).toBe(6);
    expect(dataOf(first).type).toBe("chatCreated");
    expect(seqOf(second)).toBe(7);
  });

  test("withhold-not-throw: a NOT_FOUND gate silences yields (pre-start attach / kicked member) without detaching", async () => {
    // The gate flips per probe: attach (not yet a member — no chatOpened) → event 1 withheld → event 2
    // member → event 3 kicked → event 4 member. The first verdict is consumed by the attach probe.
    const verdicts = [false, false, true, false, true];
    let call = 0;
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() => {
      const allowed = verdicts[call] ?? true;
      call += 1;
      return allowed ? Promise.resolve(BOUNDS) : Promise.reject(new ChatNotFoundError(CHAT));
    });
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    // A cursor-less attach: no durable replay — live only. The attach probe withholds (not-yet-a-member) so
    // NO chatOpened is synthesized.
    const iterator = await openChatRoom(ctx);
    const firstYield = iterator.next();

    // Publish 4 live events; the gate withholds 1 and 3.
    publishChatEvent({ seq: 1, event: event("chatCreated") });
    publishChatEvent({ seq: 2, event: event() });
    const first = await firstYield;
    publishChatEvent({ seq: 3, event: event("chatCreated") });
    publishChatEvent({ seq: 4, event: event() });
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // Only the gate-passing events came through (1 and 3 withheld; the room never failed; no chatOpened).
    expect(seqOf(first)).toBe(2);
    expect(dataOf(first).type).toBe("chatUpdated");
    expect(seqOf(second)).toBe(4);
    expect(replayChatEvents).not.toHaveBeenCalled();
  });

  test("a listener never admitted to the room receives no chatDeleted existence metadata", async () => {
    // Attach probe rejects. `chatDeleted` must not bypass that listener's complete lack of authorization;
    // the next ordinary event is admitted so the assertion is deterministic without a timeout race.
    const verdicts = [false, true];
    let call = 0;
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(() => {
      const allowed = verdicts[call] ?? true;
      call += 1;
      return allowed ? Promise.resolve(BOUNDS) : Promise.reject(new ChatNotFoundError(CHAT));
    });
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents: vi.fn(async () => []), chatEventBounds } },
    });
    const iterator = await openChatRoom(ctx);
    const pending = iterator.next();

    publishChatEvent({ seq: null, event: { type: "chatDeleted", chatId: CHAT } });
    publishChatEvent({ seq: 1, event: event() });

    expect(dataOf(await pending)).toEqual(event());
    await iterator.return?.(undefined);
  });
});

// The subscription-side syntheses (PD-134 chatOpened + PD-135 historyTruncated): synthesized per pump, never
// bus-published / logged. A synthetic carries the CURRENT resume cursor as its frame `seq`, so it never
// advances the room's cursor — a reconnect replays from the same point.
describe("the chat room — synthesized attach/resume events (PD-134/PD-135)", () => {
  // ⚠️ THIS CASE'S SEQ CHANGED (R3 — the fresh-context verifier's R1-2). It used to assert `seq === 0` on a
  // cursor-less attach, and that 0 WAS the message-loss window: the client adopted nothing, so having never
  // applied a durable frame it reconnected with a null cursor too — which requests no replay at all — and a
  // turn committed while its SSE was dark stayed invisible until a reload. A cursor-less attach now carries
  // the room's CURRENT durable high-water, which gives the client something replayable to come back to. The
  // non-advancement rule it was protecting is intact, and the RESUMING case below states it positively:
  // nothing here can advance a cursor past an UNDELIVERED row, because a cursor-less attach delivers no
  // durable rows — the client's canon read already covers everything at or below `maxSeq`.
  test("PD-134: a CURSOR-LESS attach yields `chatOpened` FIRST stamped with the room's high-water, and replays nothing", async () => {
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx);
    const opened = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened).type).toBe("chatOpened");
    expect(seqOf(opened)).toBe(BOUNDS.maxSeq);
    // Still live-only: the durable replay never runs on a cursor-less attach.
    expect(replayChatEvents).not.toHaveBeenCalled();
  });

  test("an EMPTY room's cursor-less attach still stamps 0 — there is no high-water to adopt", async () => {
    // The floor degrades to the old value exactly when the room has no durable log, which is also the one
    // case where a null cursor loses nothing.
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({
      minSeq: null,
      maxSeq: null,
      historyFloorSeq: 0,
      viewerIsHost: false,
      reasoningHostOnly: false,
    }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx);
    const opened = await iterator.next();
    await iterator.return?.(undefined);

    expect(seqOf(opened)).toBe(0);
  });

  test("the high-water STAMP is not the live-dedup floor — a row buffered before the bounds read still lands", async () => {
    // The trap the R3 stamp walked into. The live listener attaches BEFORE the bounds probe, so a row
    // published in that gap is both buffered for this subscriber and already counted in `maxSeq`. Had the
    // synthetic's stamp raised the dedup floor, that row would be dropped whole — delivered to nobody, with
    // no replay behind it (a cursor-less attach replays nothing). Only durable REPLAY rows may raise it.
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx);
    expect(seqOf(await iterator.next())).toBe(BOUNDS.maxSeq);

    const pending = iterator.next();
    // Seq 2 is BELOW the stamped high-water of 3, and this subscriber has not received it.
    publishChatEvent({ seq: 2, event: event("chatCreated") });
    const first = await pending;
    await iterator.return?.(undefined);

    expect(seqOf(first)).toBe(2);
    expect(dataOf(first).type).toBe("chatCreated");
  });

  test("a RESUMING attach keeps its OWN cursor — the high-water never overrides a client that has one", async () => {
    // The non-advancement rule, stated positively: a resuming client's synthetic must carry ITS cursor, not
    // the room's head, or the synthetic would push the socket cell past rows this client never received.
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx, { sinceSeq: 1 });
    const opened = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened).type).toBe("chatOpened");
    expect(seqOf(opened)).toBe(1);
  });

  test("PD-135: a cursor PREDATING the retained window yields `historyTruncated` after chatOpened, BEFORE the retained rows", async () => {
    // minSeq=5 ⇒ events 1..4 were dropped; resume cursor 1 predates the window (1 < 5 - 1) ⇒ truncated.
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({
      minSeq: 5,
      maxSeq: 8,
      historyFloorSeq: 0,
      viewerIsHost: false,
      reasoningHostOnly: false,
    }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => [
      { seq: 5, event: event("chatCreated") },
      { seq: 6, event: event() },
    ]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx, { sinceSeq: 1 });
    const opened = await iterator.next();
    const truncated = await iterator.next();
    const firstRow = await iterator.next();
    const secondRow = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened).type).toBe("chatOpened");
    // historyTruncated fires BEFORE replay, carrying the resume cursor seq (non-advancing).
    expect(dataOf(truncated).type).toBe("historyTruncated");
    expect(seqOf(truncated)).toBe(1);
    // Then the retained rows the client can still resume replay ascending with their durable seqs.
    expect(dataOf(firstRow).type).toBe("chatCreated");
    expect(seqOf(firstRow)).toBe(5);
    expect(seqOf(secondRow)).toBe(6);
  });

  test("PD-135: a cursor INSIDE the retained window replays WITHOUT `historyTruncated`", async () => {
    // minSeq=1 ⇒ nothing dropped; resume cursor 3 is caught up within the window (3 < 1 - 1 is false).
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({
      minSeq: 1,
      maxSeq: 6,
      historyFloorSeq: 0,
      viewerIsHost: false,
      reasoningHostOnly: false,
    }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => [{ seq: 4, event: event("chatCreated") }]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx, { sinceSeq: 3 });
    const opened = await iterator.next();
    const next = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened).type).toBe("chatOpened");
    // The very next frame is the retained row — NOT a historyTruncated one.
    expect(dataOf(next).type).toBe("chatCreated");
    expect(seqOf(next)).toBe(4);
  });

  test("PD-134 round-trip: the chatOpened synthetic does NOT corrupt the resume cursor — replay runs from the same sinceSeq", async () => {
    // Even caught-up-at-window-floor (minSeq=1, cursor 0): the replay uses the client cursor unchanged, and
    // the synthetic's seq equals that cursor (never a faked/advanced durable seq).
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({
      minSeq: 1,
      maxSeq: 2,
      historyFloorSeq: 0,
      viewerIsHost: false,
      reasoningHostOnly: false,
    }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async ({ afterSeq }) => [{ seq: (afterSeq ?? 0) + 1, event: event() }]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const iterator = await openChatRoom(ctx, { sinceSeq: 0 });
    const opened = await iterator.next();
    const row = await iterator.next();
    await iterator.return?.(undefined);

    // The synthetic re-sends cursor 0 (no advance); a cursor 0 is NOT < minSeq(1) - 1, so no truncation.
    expect(dataOf(opened).type).toBe("chatOpened");
    expect(seqOf(opened)).toBe(0);
    expect(replayChatEvents).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      afterSeq: 0,
    });
    // The first durable row advances the cursor to its real seq.
    expect(seqOf(row)).toBe(1);
  });
});

// A minimal MessageView fixture — this test only proves the wire-through, not the view shape.
const MESSAGE: MessageView = {
  id: castId<MessageView["id"]>("message_1"),
  chatId: CHAT,
  seq: 1,
  role: "assistant",
  kind: "standard",
  authorUserId: null,
  characterId: null,
  personaId: null,
  excludedFromPrompt: false,
  createdAt: 0,
  editedAt: null,
  selectedVariantId: castId<MessageView["selectedVariantId"]>("message_variant_1"),
  selectedVariantIdx: 0,
  variantCount: 1,
  hasContinuation: false,
  content: "hi",
  reasoning: null,
  model: null,
  provider: null,
  finishReason: null,
  stopReason: null,
  terminalReason: null,
  tokensIn: null,
  tokensOut: null,
  tokenProvenance: "unrecorded",
  cacheReadTokens: null,
  cacheWriteTokens: null,
  contextWindow: null,
  costUsd: null,
  ttftMs: null,
  genStartedAt: null,
  genFinishedAt: null,
  generationId: null,
  connectionId: null,
  contextBoundaryMessageId: null,
  toolCalls: [],
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D16 join-history clamp — the LIVE half. The durable replay was clamped inside the domain
// (`replayChatEvents` → `substrate/auth::isBelowHistoryFloor`) while this per-yield loop fanned the
// in-process bus out UNFILTERED, so the two halves disagreed about the SAME durable row: a clamped member
// who was CONNECTED received a post-join `messageEdited` carrying a PRE-join `MessageView` that the
// identical row would have been denied on reconnect. These pin the TRANSPORT contract — the floor comes off
// the member-gated probe, the verdict is the domain's, and a withheld row does not touch the cursor. The
// floor→row resolution itself (a real `chat_participants` row → a real live yield) is pinned end-to-end in
// the sibling `chat.int.test.ts`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the chat room — the D16 join-history clamp on the LIVE fan-out", () => {
  const LiveChat = castId<ChatId>("chat_live_clamp");

  /** A canon-mutation event carrying a `MessageView` at `seq` — the payload class the clamp decides on. A
   *  POST-join edit of a PRE-join row rides a HIGH durable seq with a LOW view seq, which is exactly why the
   *  verdict is content-keyed and not a cursor floor. */
  const editedAt = (seq: number): ChatBusEvent => ({
    type: "messageEdited",
    chatId: LiveChat,
    messageId: MESSAGE.id,
    view: { ...MESSAGE, chatId: LiveChat, seq },
  });

  /** The room's own attach probe, stubbed at a given floor (`0` = unclamped). */
  function streamAt(historyFloorSeq: number): Context {
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({
      minSeq: 1,
      maxSeq: 20,
      historyFloorSeq,
      viewerIsHost: false,
      reasoningHostOnly: false,
    }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    return makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });
  }

  test("a clamped member gets NO live view-carrying event for a PRE-join row — and the withheld row never advances the cursor", async () => {
    // Floor 5: the member joined at canon head 5, so `messages.seq` 1-4 are not theirs to see.
    const iterator = await openChatRoom(streamAt(5), { chatId: LiveChat });
    expect(dataOf(await iterator.next()).type).toBe("chatOpened");

    const pending = iterator.next(); // parks the pump in the live loop before anything is published
    // durable seq 10 — the host edits a PRE-join row while the clamped member is attached (the exploit).
    publishChatEvent({ seq: 10, event: editedAt(2) });
    // durable seq 11 — a row at/above their floor: legitimately theirs.
    publishChatEvent({ seq: 11, event: editedAt(6) });
    const first = await pending;
    await iterator.return?.(undefined);

    // The FIRST thing the clamped member ever receives is the post-join row, carried at its OWN durable seq:
    // event 10 was dropped whole (unclamped, this asserted 10), and the cursor was never advanced to 10, so
    // 11 was neither renumbered nor re-offered. The gap is the intended shape — a reconnect from 11 replays
    // forward and the domain re-applies the same verdict to anything behind it.
    expect(seqOf(first)).toBe(11);
    const delivered = dataOf(first);
    expect(delivered.type === "messageEdited" ? delivered.view?.seq : null).toBe(6);
  });

  test("an UNCLAMPED subscriber (host / `full` member) receives that same pre-join-view event live — the other arm works", async () => {
    const iterator = await openChatRoom(streamAt(0), { chatId: LiveChat });
    expect(dataOf(await iterator.next()).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 10, event: editedAt(2) });
    const first = await pending;
    await iterator.return?.(undefined);

    // Byte-identical event, same room, same instant — floor 0 short-circuits the verdict, so nothing is filtered.
    expect(seqOf(first)).toBe(10);
    const delivered = dataOf(first);
    expect(delivered.type === "messageEdited" ? delivered.view?.seq : null).toBe(2);
  });

  /** A live token chunk anchored to the canon slot it fills (`slotSeq` — what the engine's emit site stamps
   *  from the target it resolved). `text` names the slot so a leak is unmistakable in the assertion.
   *  `memberText: null` is the §3.6 producer stamp for a tick with no hidden span ("identical to
   *  `delta.text`") — the shape `domain/chat/bus` writes to the log and fans. An UNSTAMPED delta is withheld
   *  from members by design (fail-closed), so a fixture that omits it would prove nothing about the clamp. */
  const deltaInto = (slotSeq: number, text: string): ChatBusEvent => ({
    type: "delta",
    chatId: LiveChat,
    slotSeq,
    delta: { chatId: LiveChat, kind: "text", text },
    memberText: null,
  });

  test("a clamped member DOES stream a POST-join turn's live deltas — the restoration `from-join` had lost", async () => {
    // The whole point of carrying `slotSeq`: blanket-withholding deltas silently un-streamed every
    // host-restricted (`from-join`) member in a room with prior canon (messages popped in on commit).
    // Floor 5, tokens streaming into slot 7 — theirs, so they arrive at their own durable seq.
    const iterator = await openChatRoom(streamAt(5), { chatId: LiveChat });
    expect(dataOf(await iterator.next()).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 12, event: deltaInto(7, "post-join tokens") });
    const first = await pending;
    await iterator.return?.(undefined);

    expect(seqOf(first)).toBe(12);
    expect(JSON.stringify(first.value)).toContain("post-join tokens");
  });

  test("a live `delta` for a PRE-join slot is still withheld — the leak (host swipes/continues an old row) stays closed", async () => {
    // The exploit this clamp exists for: a host swiping or continuing a PRE-join slot streams THAT slot's
    // tokens live. The emit site stamps the loaded target's own seq, so the verdict withholds it — while the
    // very next post-join stream still flows. Live and replay ask the same function, so a row's visibility
    // never depends on whether the client happened to be connected.
    const iterator = await openChatRoom(streamAt(5), { chatId: LiveChat });
    expect(dataOf(await iterator.next()).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 12, event: deltaInto(2, "pre-join tokens") });
    publishChatEvent({ seq: 13, event: deltaInto(6, "post-join tokens") });
    const first = await pending;
    await iterator.return?.(undefined);

    // Withheld WITHOUT advancing the cursor: the first frame carries seq 13, not a renumbered 12.
    expect(seqOf(first)).toBe(13);
    expect(JSON.stringify(first.value)).not.toContain("pre-join tokens");
    expect(JSON.stringify(first.value)).toContain("post-join tokens");
  });

  test("an UNCLAMPED subscriber receives that same pre-join-slot delta — floor 0 short-circuits before any compare", async () => {
    const iterator = await openChatRoom(streamAt(0), { chatId: LiveChat });
    expect(dataOf(await iterator.next()).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 12, event: deltaInto(2, "pre-join tokens") });
    const first = await pending;
    await iterator.return?.(undefined);

    expect(seqOf(first)).toBe(12);
    expect(JSON.stringify(first.value)).toContain("pre-join tokens");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// §5.5 — TWO ROOMS, ONE SOCKET, ONE DECEPTION-ACTIVE. The property the fold creates the possibility of
// breaking. The HIDDEN-SPAN half is now true by CONSTRUCTION: the member bytes are stamped at the PRODUCER
// (`memberText`) and every read seam here is a stateless field read, so there is no per-pump scrub state
// left to bleed between rooms — the mid-slot reconnect leak that forced the stamp producer-side is pinned in
// `domain/chat`. What remains PER ROOM, and is what these pin: the P3 reasoning cut is a verdict resolved
// per yield from THIS room's own `chatEventBounds`; the pump forwards the stamp verbatim and withholds an
// UNSTAMPED delta fail-closed; and a reconnect re-derives both from CURRENT membership rather than from
// anything cached in the socket cell.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
describe("§5.5 two rooms on one socket — the per-room verdict, and the producer stamp forwarded verbatim", () => {
  const DeceptionChat = castId<ChatId>("chat_deception");
  const PlainChat = castId<ChatId>("chat_plain");

  /** The member-gated probe, per chat: the deception room resolves `reasoningHostOnly` TRUE, the plain room
   *  FALSE. Both are MEMBER views (never host) — the only axis that differs is the game's deception verdict. */
  const bounds: ChatService["chatEventBounds"] = ({ chatId }) =>
    Promise.resolve({
      minSeq: 1,
      maxSeq: 1,
      historyFloorSeq: 0,
      viewerIsHost: false,
      reasoningHostOnly: chatId === DeceptionChat,
    });

  const reasoningDelta = (chatId: ChatId, text: string): ChatBusEvent => ({
    type: "delta",
    chatId,
    slotSeq: 1,
    delta: { chatId, kind: "reasoning", text },
  });
  /** A `text` delta as the PRODUCER writes it: `memberText: null` = "stamped, byte-identical to `delta.text`"
   *  (the no-hidden-span tick). A `memberText` STRING is the scrubbed member projection of a tick that held a
   *  hidden span; `undefined` is an UNSTAMPED delta, which every member read seam withholds fail-closed. */
  const textDelta = (chatId: ChatId, text: string, memberText: string | null = null): ChatBusEvent => ({
    type: "delta",
    chatId,
    slotSeq: 1,
    delta: { chatId, kind: "text", text },
    memberText,
  });
  const unstampedDelta = (chatId: ChatId, text: string): ChatBusEvent => ({
    type: "delta",
    chatId,
    slotSeq: 1,
    delta: { chatId, kind: "text", text },
  });

  /** Attach BOTH rooms to ONE socket and connect; returns the iterator + a re-connect for the same cell. */
  async function openBothRooms(ctx: Context): Promise<{ readonly socketId: SocketId; readonly iterator: AsyncIterator<unknown> }> {
    const socketId = nextSocket();
    const call = caller(ctx);
    await call.stream.attach({ socketId, ref: { channel: "chat", chatId: DeceptionChat } });
    await call.stream.attach({ socketId, ref: { channel: "chat", chatId: PlainChat } });
    const socket = (await call.stream.connect({ socketId })) as AsyncIterable<unknown>;
    return { socketId, iterator: socket[Symbol.asyncIterator]() };
  }

  /** Drain `count` frames, running `drive` once the pumps are up (the setup slice is synchronous, so the
   *  first pull attaches BOTH listeners before anything is published). */
  async function drain(iterator: AsyncIterator<unknown>, count: number, drive: () => void): Promise<StreamFrame[]> {
    const first = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    drive();
    const frames: StreamFrame[] = [frameOf((await first).value)];
    for (let i = 1; i < count; i++) {
      const result = await iterator.next();
      frames.push(frameOf(result.value));
    }
    return frames;
  }

  /** The `chat` data frames for one room, in order. */
  function roomEvents(frames: readonly StreamFrame[], chatId: ChatId): ChatBusEvent[] {
    return frames.filter((f): f is Extract<StreamDataFrame, { channel: "chat" }> => f.channel === "chat" && f.chatId === chatId).map((f) => f.event);
  }

  test("the deception room's reasoning cut does NOT reach the other room — live", async () => {
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
    });
    const { iterator } = await openBothRooms(ctx);

    // 2 attach acks + 2 chatOpened + (deception: reasoning DROPPED, text kept) + (plain: reasoning kept, text
    // kept) = 4 + 1 + 2 = 7 frames.
    const frames = await drain(iterator, 7, () => {
      publishChatEvent({ seq: 10, event: reasoningDelta(DeceptionChat, "the truth is the well is poisoned") });
      publishChatEvent({ seq: 11, event: textDelta(DeceptionChat, "All is well.") });
      publishChatEvent({ seq: 12, event: reasoningDelta(PlainChat, "thinking out loud") });
      publishChatEvent({ seq: 13, event: textDelta(PlainChat, "Hello there.") });
    });
    await iterator.return?.(undefined);

    const deception = roomEvents(frames, DeceptionChat);
    const plain = roomEvents(frames, PlainChat);
    // The deception room: the whole reasoning channel is withheld, the body still streams.
    expect(deception.some((e) => e.type === "delta" && e.delta.kind === "reasoning")).toBe(false);
    expect(JSON.stringify(deception)).not.toContain("the well is poisoned");
    expect(JSON.stringify(deception)).toContain("All is well.");
    // The OTHER room, same socket, same principal, same instant: its reasoning is INTACT.
    expect(plain.some((e) => e.type === "delta" && e.delta.kind === "reasoning")).toBe(true);
    expect(JSON.stringify(plain)).toContain("thinking out loud");
  });

  test("the pump forwards each room's PRODUCER STAMP verbatim — a held span in one room is not the other's business", async () => {
    // Both rooms stream into slotSeq 1, which is exactly the collision a per-pump scrubber map used to make
    // possible. There is no such map now: the producer already decided each tick's member bytes, and the pump
    // is a stateless field read. So the deception room's held `<lie …` open (stamped `"He says "` — the
    // provably-safe prefix, the raw tail withheld) and the plain room's full tick pass each other untouched,
    // and the RAW text of a partially-withheld tick never reaches the member's wire.
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
    });
    const { iterator } = await openBothRooms(ctx);

    // 2 acks + 2 chatOpened + deception "He says " + plain "Nothing to hide." = 6.
    const frames = await drain(iterator, 6, () => {
      publishChatEvent({ seq: 20, event: textDelta(DeceptionChat, "He says <lie tru", "He says ") });
      publishChatEvent({ seq: 21, event: textDelta(PlainChat, "Nothing to hide.") });
    });
    await iterator.return?.(undefined);

    // The deception room got the stamped prefix, and NOT the raw bytes the producer withheld…
    expect(JSON.stringify(roomEvents(frames, DeceptionChat))).toContain("He says ");
    expect(JSON.stringify(roomEvents(frames, DeceptionChat))).not.toContain("<lie");
    // …and the OTHER room's identical slot streamed its own tick whole.
    expect(JSON.stringify(roomEvents(frames, PlainChat))).toContain("Nothing to hide.");
  });

  test("an UNSTAMPED delta is withheld from a member — fail-closed, per room, and it does not stall the room", async () => {
    // The stamp is the member's ONLY source of delta bytes, so a producer that bypassed `domain/chat/bus`
    // can under-deliver but never leak. The room must drop that tick (no cursor advance) and keep streaming.
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
    });
    const { iterator } = await openBothRooms(ctx);

    // 2 acks + 2 chatOpened + the STAMPED tick only (the unstamped one is withheld) = 5.
    const frames = await drain(iterator, 5, () => {
      publishChatEvent({ seq: 40, event: unstampedDelta(DeceptionChat, "raw model bytes nobody vetted") });
      publishChatEvent({ seq: 41, event: textDelta(DeceptionChat, "vetted prose") });
    });
    await iterator.return?.(undefined);

    const deception = roomEvents(frames, DeceptionChat);
    expect(JSON.stringify(deception)).not.toContain("nobody vetted");
    expect(JSON.stringify(deception)).toContain("vetted prose");
  });

  test("a RECONNECT re-derives each room's verdict from CURRENT membership — never a cached/shared one", async () => {
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { chatEventBounds: bounds, replayChatEvents: () => Promise.resolve([]) } },
    });
    const { socketId, iterator } = await openBothRooms(ctx);
    // Go live once (both pumps up), then drop the socket — the cell (and its rooms) survives the reap window.
    await drain(iterator, 4, () => undefined);
    await iterator.return?.(undefined);

    // The RE-connect: the same cell, FRESH pumps — the moment a per-pump verdict cache would go stale. Both
    // rooms are durable, so the RECONNECT BARRIER holds them until the client re-announces (which the real
    // room registry does on every live edge after the first); that is what makes the client's own mark the
    // resume truth instead of the server's delivered cursor.
    const socket = (await caller(ctx).stream.connect({ socketId })) as AsyncIterable<unknown>;
    const resumed = socket[Symbol.asyncIterator]();
    const announce = caller(ctx);
    await announce.stream.attach({ socketId, ref: { channel: "chat", chatId: DeceptionChat } });
    await announce.stream.attach({ socketId, ref: { channel: "chat", chatId: PlainChat } });
    const frames = await drain(resumed, 7, () => {
      publishChatEvent({ seq: 30, event: reasoningDelta(DeceptionChat, "still the poisoned well") });
      publishChatEvent({ seq: 31, event: textDelta(DeceptionChat, "All is well.") });
      publishChatEvent({ seq: 32, event: reasoningDelta(PlainChat, "thinking again") });
      publishChatEvent({ seq: 33, event: textDelta(PlainChat, "Hello again.") });
    });
    await resumed.return?.(undefined);

    expect(JSON.stringify(roomEvents(frames, DeceptionChat))).not.toContain("poisoned well");
    expect(JSON.stringify(roomEvents(frames, PlainChat))).toContain("thinking again");
  });
});
