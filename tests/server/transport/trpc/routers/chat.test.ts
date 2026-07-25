// chat.streamMessages — the per-chat SSE subscription (PD-46's stream half; core/Tier-4-Transport.md §5).
// Load-bearing: on RECONNECT (`lastEventId`) it replays the durable `chat_events` rows with
// `seq > lastEventId` (via the member-gated `chat.replayChatEvents`) BEFORE draining live; the membership
// gate WITHHOLDS-not-throws (a NOT_FOUND probe yields nothing and keeps the stream open — the
// draft-tolerant subscribe + the kicked-member cutoff), and the per-yield gate runs on EVERY live event.
// Driven through the real ladder via `createCaller` (authed); the live bus is transport module state.

import type { ChatBusEvent, ChatMacroNameProducer, MessageView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES } from "@orb/contracts/chat";
import type { CharacterId, ChatId, ChatInjectionId, ChatParticipantId, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { publishChatEvent } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { caller, makeContext, principal } from "../_support.ts";

const MEMBER = castId<UserId>("user_member");
const NON_MEMBER = castId<UserId>("user_non_member");
const CHAT = castId<ChatId>("chat_1");
// `historyFloorSeq: 0` = the UNCLAMPED probe (a host / a `full` member / any born-here seat) — the arm every
// pre-D16 assertion in this file was written against, so the clamp is provably invisible to it.
const BOUNDS = { minSeq: 1, maxSeq: 3, historyFloorSeq: 0 };

const event = (type: "chatUpdated" | "chatDeleted" = "chatUpdated"): ChatBusEvent => ({
  type,
  chatId: CHAT,
});

// Unwrap a yielded subscription value — `tracked()` yields `[id, data, symbol]`; data is at index 1.
function dataOf(yielded: unknown): ChatBusEvent {
  const value = Array.isArray(yielded) ? yielded[1] : yielded;
  return value as ChatBusEvent;
}
function idOf(yielded: unknown): string {
  return (Array.isArray(yielded) ? yielded[0] : "") as string;
}

describe("chat.streamMessages — durable-first resume", () => {
  test("replays durable rows newer than lastEventId, ascending, before going live (after the chatOpened attach synthesis)", async () => {
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async ({ afterSeq }) => [
      { seq: (afterSeq ?? 0) + 1, event: event("chatDeleted") },
      { seq: (afterSeq ?? 0) + 2, event: event() },
    ]);
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT, lastEventId: "5" });
    const iterator = sub[Symbol.asyncIterator]();
    // PD-134: `chatOpened` synthesizes FIRST at attach, carrying the resume cursor as its id (never
    // advancing `lastEventId` — a reconnect re-sends "5" and replays from the same durable point).
    const opened = await iterator.next();
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened.value).type).toBe("chatOpened");
    expect(idOf(opened.value)).toBe("5");
    // The durable replay ran with the resume cursor, member-gated…
    expect(replayChatEvents).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      afterSeq: 5,
    });
    // …and the missed events replay ASCENDING with their durable seq as the tracked id (no `historyTruncated`:
    // cursor 5 is INSIDE the retained window minSeq=1).
    expect(idOf(first.value)).toBe("6");
    expect(dataOf(first.value).type).toBe("chatDeleted");
    expect(idOf(second.value)).toBe("7");
  });

  test("withhold-not-throw: a NOT_FOUND gate silences yields (pre-start subscribe / kicked member) without tearing down", async () => {
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

    // First subscribe (no lastEventId): no durable replay — live only. The attach probe withholds
    // (not-yet-a-member) so NO chatOpened is synthesized.
    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT });
    const iterator = sub[Symbol.asyncIterator]();
    const firstYield = iterator.next();

    // Publish 4 live events; the gate withholds 1 and 3.
    publishChatEvent({ seq: 1, event: event("chatDeleted") });
    publishChatEvent({ seq: 2, event: event() });
    const first = await firstYield;
    publishChatEvent({ seq: 3, event: event("chatDeleted") });
    publishChatEvent({ seq: 4, event: event() });
    const second = await iterator.next();
    await iterator.return?.(undefined);

    // Only the gate-passing events came through (1 and 3 withheld; the stream never errored; no chatOpened).
    expect(idOf(first.value)).toBe("2");
    expect(dataOf(first.value).type).toBe("chatUpdated");
    expect(idOf(second.value)).toBe("4");
    expect(replayChatEvents).not.toHaveBeenCalled();
  });
});

// The subscription-side syntheses (PD-134 chatOpened + PD-135 historyTruncated): synthesized per
// subscription in `chatEventStream`, never bus-published / logged. A synthetic carries the CURRENT resume
// cursor as its tracked id, so it never advances `lastEventId` — a reconnect replays from the same point.
describe("chat.streamMessages — synthesized attach/resume events (PD-134/PD-135)", () => {
  test("PD-134: attach with membership yields `chatOpened` FIRST (fresh subscribe, id = the null-cursor floor '0'), no replay", async () => {
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => BOUNDS);
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT });
    const iterator = sub[Symbol.asyncIterator]();
    const opened = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened.value).type).toBe("chatOpened");
    expect(idOf(opened.value)).toBe("0");
    // A fresh subscribe drains live only — the durable replay never runs.
    expect(replayChatEvents).not.toHaveBeenCalled();
  });

  test("PD-135: a cursor PREDATING the retained window yields `historyTruncated` after chatOpened, BEFORE the retained rows", async () => {
    // minSeq=5 ⇒ events 1..4 were dropped; resume cursor 1 predates the window (1 < 5 - 1) ⇒ truncated.
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({ minSeq: 5, maxSeq: 8, historyFloorSeq: 0 }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => [
      { seq: 5, event: event("chatDeleted") },
      { seq: 6, event: event() },
    ]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT, lastEventId: "1" });
    const iterator = sub[Symbol.asyncIterator]();
    const opened = await iterator.next();
    const truncated = await iterator.next();
    const firstRow = await iterator.next();
    const secondRow = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened.value).type).toBe("chatOpened");
    // historyTruncated fires BEFORE replay, carrying the resume cursor id (non-advancing).
    expect(dataOf(truncated.value).type).toBe("historyTruncated");
    expect(idOf(truncated.value)).toBe("1");
    // Then the retained rows the client can still resume replay ascending with their durable seq ids.
    expect(dataOf(firstRow.value).type).toBe("chatDeleted");
    expect(idOf(firstRow.value)).toBe("5");
    expect(idOf(secondRow.value)).toBe("6");
  });

  test("PD-135: a cursor INSIDE the retained window replays WITHOUT `historyTruncated`", async () => {
    // minSeq=1 ⇒ nothing dropped; resume cursor 3 is caught up within the window (3 < 1 - 1 is false).
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({ minSeq: 1, maxSeq: 6, historyFloorSeq: 0 }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => [{ seq: 4, event: event("chatDeleted") }]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT, lastEventId: "3" });
    const iterator = sub[Symbol.asyncIterator]();
    const opened = await iterator.next();
    const next = await iterator.next();
    await iterator.return?.(undefined);

    expect(dataOf(opened.value).type).toBe("chatOpened");
    // The very next yield is the retained row — NOT a historyTruncated frame.
    expect(dataOf(next.value).type).toBe("chatDeleted");
    expect(idOf(next.value)).toBe("4");
  });

  test("PD-134 round-trip: the chatOpened synthetic does NOT corrupt the resume cursor — replay runs from the same lastEventId", async () => {
    // Even caught-up-at-window-floor (minSeq=1, cursor 0): resume replay uses the client cursor unchanged,
    // and the synthetic id equals that cursor (never a faked/advanced durable seq).
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({ minSeq: 1, maxSeq: 2, historyFloorSeq: 0 }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async ({ afterSeq }) => [{ seq: (afterSeq ?? 0) + 1, event: event() }]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });

    const sub = await caller(ctx).chat.streamMessages({ chatId: CHAT, lastEventId: "0" });
    const iterator = sub[Symbol.asyncIterator]();
    const opened = await iterator.next();
    const row = await iterator.next();
    await iterator.return?.(undefined);

    // The synthetic re-sends cursor "0" (no advance); a cursor 0 is NOT < minSeq(1) - 1, so no truncation.
    expect(dataOf(opened.value).type).toBe("chatOpened");
    expect(idOf(opened.value)).toBe("0");
    expect(replayChatEvents).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      afterSeq: 0,
    });
    // The first durable row advances the cursor to its real seq.
    expect(idOf(row.value)).toBe("1");
  });
});

// A minimal MessageView fixture — the router test only proves the wire-through, not the view shape.
const MESSAGE: MessageView = {
  id: castId<MessageView["id"]>("message_1"),
  chatId: CHAT,
  seq: 1,
  role: "assistant",
  authorUserId: null,
  characterId: null,
  personaId: null,
  excludedFromPrompt: false,
  createdAt: 0,
  editedAt: null,
  selectedVariantId: castId<MessageView["selectedVariantId"]>("message_variant_1"),
  selectedVariantIdx: 0,
  variantCount: 1,
  content: "hi",
  reasoning: null,
  model: null,
  provider: null,
  finishReason: null,
  stopReason: null,
  terminalReason: null,
  tokensIn: null,
  tokensOut: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  contextWindow: null,
  costUsd: null,
  ttftMs: null,
  genStartedAt: null,
  genFinishedAt: null,
  generationId: null,
  contextBoundaryMessageId: null,
  toolCalls: [],
};

// The empty producer fixture (Chat-Macro-Resolution.md §1) — this router test only proves the wire-through,
// not the producer's own resolution (that's `persistence/macro-names.int.test.ts` + `read.int.test.ts`).
const EMPTY_MACRO_NAMES: ChatMacroNameProducer = { characterNames: [], personaNames: [] };

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
describe("chat.streamMessages — the D16 join-history clamp on the LIVE fan-out", () => {
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

  /** The subscription's own attach probe, stubbed at a given floor (`0` = unclamped). */
  function streamAt(historyFloorSeq: number): ReturnType<typeof makeContext> {
    const chatEventBounds = vi.fn<ChatService["chatEventBounds"]>(async () => ({ minSeq: 1, maxSeq: 20, historyFloorSeq }));
    const replayChatEvents = vi.fn<ChatService["replayChatEvents"]>(async () => []);
    return makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { replayChatEvents, chatEventBounds } },
    });
  }

  test("a clamped member gets NO live view-carrying event for a PRE-join row — and the withheld row never advances the cursor", async () => {
    // Floor 5: the member joined at canon head 5, so `messages.seq` 1-4 are not theirs to see.
    const sub = await caller(streamAt(5)).chat.streamMessages({ chatId: LiveChat });
    const iterator = sub[Symbol.asyncIterator]();
    expect(dataOf((await iterator.next()).value).type).toBe("chatOpened");

    const pending = iterator.next(); // parks the generator in the live loop before anything is published
    // durable seq 10 — the host edits a PRE-join row while the clamped member is connected (the exploit).
    publishChatEvent({ seq: 10, event: editedAt(2) });
    // durable seq 11 — a row at/above their floor: legitimately theirs.
    publishChatEvent({ seq: 11, event: editedAt(6) });
    const first = await pending;
    await iterator.return?.(undefined);

    // The FIRST thing the clamped member ever receives is the post-join row, carried at its OWN durable seq:
    // event 10 was dropped whole (unclamped, this asserted "10"), and the cursor was never advanced to 10, so
    // 11 was neither renumbered nor re-offered. The gap is the intended shape — a reconnect from 11 replays
    // forward and the domain re-applies the same verdict to anything behind it.
    expect(idOf(first.value)).toBe("11");
    const delivered = dataOf(first.value);
    expect(delivered.type === "messageEdited" ? delivered.view?.seq : null).toBe(6);
  });

  test("an UNCLAMPED subscriber (host / `full` member) receives that same pre-join-view event live — the other arm works", async () => {
    const sub = await caller(streamAt(0)).chat.streamMessages({ chatId: LiveChat });
    const iterator = sub[Symbol.asyncIterator]();
    expect(dataOf((await iterator.next()).value).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 10, event: editedAt(2) });
    const first = await pending;
    await iterator.return?.(undefined);

    // Byte-identical event, same room, same instant — floor 0 short-circuits the verdict, so nothing is filtered.
    expect(idOf(first.value)).toBe("10");
    const delivered = dataOf(first.value);
    expect(delivered.type === "messageEdited" ? delivered.view?.seq : null).toBe(2);
  });

  /** A live token chunk anchored to the canon slot it fills (`slotSeq` — what the engine's emit site stamps
   *  from the target it resolved). `text` names the slot so a leak is unmistakable in the assertion. */
  const deltaInto = (slotSeq: number, text: string): ChatBusEvent => ({
    type: "delta",
    chatId: LiveChat,
    slotSeq,
    delta: { chatId: LiveChat, kind: "text", text },
  });

  test("a clamped member DOES stream a POST-join turn's live deltas — the restoration `from-join` had lost", async () => {
    // The whole point of carrying `slotSeq`: blanket-withholding deltas silently un-streamed every
    // host-restricted (`from-join`) member in a room with prior canon (messages popped in on commit).
    // Floor 5, tokens streaming into slot 7 — theirs, so they arrive at their own durable seq.
    const sub = await caller(streamAt(5)).chat.streamMessages({ chatId: LiveChat });
    const iterator = sub[Symbol.asyncIterator]();
    expect(dataOf((await iterator.next()).value).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 12, event: deltaInto(7, "post-join tokens") });
    const first = await pending;
    await iterator.return?.(undefined);

    expect(idOf(first.value)).toBe("12");
    expect(JSON.stringify(first.value)).toContain("post-join tokens");
  });

  test("a live `delta` for a PRE-join slot is still withheld — the leak (host swipes/continues an old row) stays closed", async () => {
    // The exploit this clamp exists for: a host swiping or continuing a PRE-join slot streams THAT slot's
    // tokens live. The emit site stamps the loaded target's own seq, so the verdict withholds it — while the
    // very next post-join stream still flows. Live and replay ask the same function, so a row's visibility
    // never depends on whether the client happened to be connected.
    const sub = await caller(streamAt(5)).chat.streamMessages({ chatId: LiveChat });
    const iterator = sub[Symbol.asyncIterator]();
    expect(dataOf((await iterator.next()).value).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 12, event: deltaInto(2, "pre-join tokens") });
    publishChatEvent({ seq: 13, event: deltaInto(6, "post-join tokens") });
    const first = await pending;
    await iterator.return?.(undefined);

    // Withheld WITHOUT advancing the cursor: the first yield is seq 13, not a renumbered 12.
    expect(idOf(first.value)).toBe("13");
    expect(JSON.stringify(first.value)).not.toContain("pre-join tokens");
    expect(JSON.stringify(first.value)).toContain("post-join tokens");
  });

  test("an UNCLAMPED subscriber receives that same pre-join-slot delta — floor 0 short-circuits before any compare", async () => {
    const sub = await caller(streamAt(0)).chat.streamMessages({ chatId: LiveChat });
    const iterator = sub[Symbol.asyncIterator]();
    expect(dataOf((await iterator.next()).value).type).toBe("chatOpened");

    const pending = iterator.next();
    publishChatEvent({ seq: 12, event: deltaInto(2, "pre-join tokens") });
    const first = await pending;
    await iterator.return?.(undefined);

    expect(idOf(first.value)).toBe("12");
    expect(JSON.stringify(first.value)).toContain("pre-join tokens");
  });
});

describe("chat.listMessages — the paged canon read (D26), member-gated", () => {
  test("a member pages messages: the parsed cursor/limit reach the verb with the resolved Principal", async () => {
    const listMessages = vi.fn<ChatService["listMessages"]>(async () => ({
      messages: [MESSAGE],
      macroNames: EMPTY_MACRO_NAMES,
      personaAvatars: [],
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listMessages } },
    });

    const result = await caller(ctx).chat.listMessages({ chatId: CHAT, beforeSeq: 10, limit: 20 });

    expect(listMessages).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      beforeSeq: 10,
      limit: 20,
    });
    expect(result).toEqual({
      messages: [MESSAGE],
      macroNames: EMPTY_MACRO_NAMES,
      personaAvatars: [],
    });
  });

  test("a non-member gets the leak-free NOT_FOUND the verb's requireParticipant gate throws (the getChat collapse)", async () => {
    const listMessages = vi.fn<ChatService["listMessages"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { listMessages } },
    });

    await expect(caller(ctx).chat.listMessages({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.listMessageVariants — the swipe strip's step-target resolver (D26 full sibling set)", () => {
  test("a thin pass-through: chatId/messageId reach the verb with the resolved Principal", async () => {
    const variants = [
      { variantId: castId<MessageVariantId>("message_variant_1"), idx: 0 },
      { variantId: castId<MessageVariantId>("message_variant_2"), idx: 1 },
    ];
    const listMessageVariants = vi.fn<ChatService["listMessageVariants"]>(async () => variants);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listMessageVariants } },
    });

    const result = await caller(ctx).chat.listMessageVariants({
      chatId: CHAT,
      messageId: MESSAGE.id,
    });

    expect(listMessageVariants).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
    });
    expect(result).toEqual(variants);
  });

  test("a foreign-chat messageId surfaces the verb's leak-free NOT_FOUND", async () => {
    const listMessageVariants = vi.fn<ChatService["listMessageVariants"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listMessageVariants } },
    });

    await expect(caller(ctx).chat.listMessageVariants({ chatId: CHAT, messageId: MESSAGE.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.selectVariant — the swipe strip's step-BACK verb (task #19 wire-through)", () => {
  test("a thin pass-through: chatId/messageId/variantId reach the verb with the resolved Principal", async () => {
    const variantId = castId<MessageVariantId>("message_variant_2");
    const selectVariant = vi.fn<ChatService["selectVariant"]>(async () => MESSAGE);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { selectVariant } },
    });

    const result = await caller(ctx).chat.selectVariant({
      chatId: CHAT,
      messageId: MESSAGE.id,
      variantId,
    });

    expect(selectVariant).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      variantId,
    });
    expect(result).toEqual(MESSAGE);
  });

  test("a sibling-ownership miss (a variantId from a DIFFERENT slot) surfaces the verb's leak-free NOT_FOUND", async () => {
    const variantId = castId<MessageVariantId>("message_variant_other_slot");
    const selectVariant = vi.fn<ChatService["selectVariant"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { selectVariant } },
    });

    await expect(caller(ctx).chat.selectVariant({ chatId: CHAT, messageId: MESSAGE.id, variantId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// The three guided-generations verbs (chat-surface-lane task #27 — the composer WAND): all were fully
// implemented in domain/chat/verbs/turn.ts but never exposed on this router (the same MISSING-API shape
// selectVariant/abort were in). Each is a thin pass-through, incl. an untouched `guided` steer object.

describe("chat.continueTurn — the guided-continue verb (composer wand wire-through)", () => {
  test("a thin pass-through: chatId/messageId/guided reach the verb with the resolved Principal", async () => {
    const continueTurn = vi.fn<ChatService["continueTurn"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { continueTurn } },
    });

    const guided = { action: "continue" as const, input: "steer it darker" };
    const result = await caller(ctx).chat.continueTurn({
      chatId: CHAT,
      messageId: MESSAGE.id,
      guided,
    });

    expect(continueTurn).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      guided,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-assistant / missing target surfaces the verb's leak-free NOT_FOUND", async () => {
    const continueTurn = vi.fn<ChatService["continueTurn"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { continueTurn } },
    });

    await expect(caller(ctx).chat.continueTurn({ chatId: CHAT, messageId: MESSAGE.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.impersonate — the guided-impersonate verb (composer wand wire-through)", () => {
  test("a thin pass-through: chatId/personaId/guided (incl. the person word) reach the verb", async () => {
    const impersonate = vi.fn<ChatService["impersonate"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { impersonate } },
    });

    const guided = {
      action: "impersonate" as const,
      input: "ask about the ruins",
      person: "third",
    };
    const result = await caller(ctx).chat.impersonate({ chatId: CHAT, guided });

    expect(impersonate).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      guided,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-member gets the verb's leak-free NOT_FOUND (requireParticipant gate)", async () => {
    const impersonate = vi.fn<ChatService["impersonate"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { impersonate } },
    });

    await expect(caller(ctx).chat.impersonate({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.generate — the guided-response verb (composer wand wire-through)", () => {
  test("a thin pass-through: chatId/speakerCharacterId/guided reach the verb", async () => {
    const generate = vi.fn<ChatService["generate"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { generate } },
    });

    const guided = { action: "response" as const, input: "hint at the letter" };
    const result = await caller(ctx).chat.generate({ chatId: CHAT, guided });

    expect(generate).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      guided,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-member gets the verb's leak-free NOT_FOUND (requireParticipant gate)", async () => {
    const generate = vi.fn<ChatService["generate"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { generate } },
    });

    await expect(caller(ctx).chat.generate({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// The per-message ACTION cluster's four verbs — all were fully implemented in domain/chat but never
// exposed on this router (the same MISSING-API shape selectVariant/abort were in). Each is a thin
// pass-through; the leak-free NOT_FOUND collapse is proven once per verb (the same shape every other
// leak-free test above proves — the router adds no gating of its own, it only forwards).

describe("chat.editMessage — edit-in-place's save verb (chat-surface lane wire-through)", () => {
  test("a thin pass-through: chatId/messageId/content reach the verb with the resolved Principal", async () => {
    const editMessage = vi.fn<ChatService["editMessage"]>(async () => MESSAGE);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { editMessage } },
    });

    const result = await caller(ctx).chat.editMessage({
      chatId: CHAT,
      messageId: MESSAGE.id,
      content: "edited content",
    });

    expect(editMessage).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      content: "edited content",
    });
    expect(result).toEqual(MESSAGE);
  });

  test("a non-author non-host gets the verb's leak-free NOT_FOUND (author-or-host gate)", async () => {
    const editMessage = vi.fn<ChatService["editMessage"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { editMessage } },
    });

    await expect(caller(ctx).chat.editMessage({ chatId: CHAT, messageId: MESSAGE.id, content: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.setMessageHidden — the hide-from-AI toggle (chat-surface lane wire-through)", () => {
  test("a thin pass-through: chatId/messageId/hidden reach the verb with the resolved Principal", async () => {
    const setMessageHidden = vi.fn<ChatService["setMessageHidden"]>(async () => ({
      ...MESSAGE,
      excludedFromPrompt: true,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setMessageHidden } },
    });

    const result = await caller(ctx).chat.setMessageHidden({
      chatId: CHAT,
      messageId: MESSAGE.id,
      hidden: true,
    });

    expect(setMessageHidden).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageId: MESSAGE.id,
      hidden: true,
    });
    expect(result.excludedFromPrompt).toBe(true);
  });

  test("a non-author non-host gets the verb's leak-free NOT_FOUND (author-or-host gate)", async () => {
    const setMessageHidden = vi.fn<ChatService["setMessageHidden"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setMessageHidden } },
    });

    await expect(caller(ctx).chat.setMessageHidden({ chatId: CHAT, messageId: MESSAGE.id, hidden: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.deleteMessages — the bulk delete verb (chat-surface lane wire-through)", () => {
  test("a thin pass-through: chatId/messageIds reach the verb with the resolved Principal", async () => {
    const deleteMessages = vi.fn<ChatService["deleteMessages"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { deleteMessages } },
    });

    const result = await caller(ctx).chat.deleteMessages({
      chatId: CHAT,
      messageIds: [MESSAGE.id],
    });

    expect(deleteMessages).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      messageIds: [MESSAGE.id],
    });
    expect(result).toBeUndefined();
  });

  test("a member deleting another's slot without host role gets the verb's leak-free NOT_FOUND", async () => {
    const deleteMessages = vi.fn<ChatService["deleteMessages"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { deleteMessages } },
    });

    await expect(caller(ctx).chat.deleteMessages({ chatId: CHAT, messageIds: [MESSAGE.id] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.forkChat — the deep-copy-into-a-new-chat verb (chat-surface lane wire-through)", () => {
  const ForkedChat = castId<ChatId>("chat_forked_1");
  // A minimal ChatDetail literal — this router test only proves the wire-through, not the view shape
  // (the same posture the file-header MESSAGE fixture takes).
  const ForkResult: Awaited<ReturnType<ChatService["forkChat"]>> = {
    chat: {
      id: ForkedChat,
      title: "Forked chat",
      star: false,
      archived: false,
      parentChatId: CHAT,
      forkedAt: 0,
      anchorPersonaId: null,
      participants: [],
      viewerActivePersonaId: null,
      viewerIsHost: true,
      viewerUserId: MEMBER,
      pendingHostUserId: null,
      group: DEFAULT_GROUP_CONFIG,
      roomOverrides: DEFAULT_ROOM_OVERRIDES,
      background: null,
      opening: null,
      compactSummary: null,
      compactedAtSeq: null,
      createdAt: 0,
      updatedAt: 0,
      macroNames: EMPTY_MACRO_NAMES,
      personaAvatars: [],
    },
  };

  test("a thin pass-through: chatId/throughSeq/title reach the verb with the resolved Principal", async () => {
    const forkChat = vi.fn<ChatService["forkChat"]>(async () => ForkResult);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { forkChat } },
    });

    const result = await caller(ctx).chat.forkChat({
      chatId: CHAT,
      throughSeq: MESSAGE.seq,
      title: "Forked chat",
    });

    expect(forkChat).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      throughSeq: MESSAGE.seq,
      title: "Forked chat",
    });
    expect(result.chat.id).toBe(ForkedChat);
    expect(result.chat.parentChatId).toBe(CHAT);
  });

  test("a non-member gets the verb's leak-free NOT_FOUND (requireParticipant gate)", async () => {
    const forkChat = vi.fn<ChatService["forkChat"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { forkChat } },
    });

    await expect(caller(ctx).chat.forkChat({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// The CONTEXT-panel cluster (task #28 — room-overrides · preview-request · manual injections): all were
// fully implemented in domain/chat (verbs/roster.ts, verbs/read.ts, verbs/chat-lifecycle.ts) — host/member
// gated via substrate/auth/matrix.ts — but never exposed on this router (the same MISSING-API shape the
// clusters above were in). Thin pass-throughs; the leak-free NOT_FOUND collapse is the verb's own gate.

describe("chat.setRoomOverrides — the per-chat prompt overrides write (task #28 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/overrides reach the verb with the resolved Principal", async () => {
    const overrides = { mainPrompt: "Be terse.", scenario: "A rainy dock at midnight." };
    const setRoomOverrides = vi.fn<ChatService["setRoomOverrides"]>(async () => overrides);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setRoomOverrides } },
    });

    const result = await caller(ctx).chat.setRoomOverrides({ chatId: CHAT, overrides });

    expect(setRoomOverrides).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      overrides,
    });
    expect(result).toEqual(overrides);
  });

  test("a stray key is stripped at the boundary (roomOverridesSchema.strict allowlist) — the verb sees only the four fields", async () => {
    const setRoomOverrides = vi.fn<ChatService["setRoomOverrides"]>(async () => ({}));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setRoomOverrides } },
    });

    // A rogue field must fail the strict wire schema before ever reaching the verb (a host-only allowlist).
    await expect(
      caller(ctx).chat.setRoomOverrides({
        chatId: CHAT,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-schema input to prove the strict boundary rejects it.
        overrides: { mainPrompt: "ok", rogue: "nope" } as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(setRoomOverrides).not.toHaveBeenCalled();
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const setRoomOverrides = vi.fn<ChatService["setRoomOverrides"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setRoomOverrides } },
    });

    await expect(caller(ctx).chat.setRoomOverrides({ chatId: CHAT, overrides: { mainPrompt: "x" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.previewAssembly — the assembled-prompt preview + trace (task #28 wire-through, host-only)", () => {
  const Preview: Awaited<ReturnType<ChatService["previewAssembly"]>> = {
    prompt: {
      static: "SYSTEM: be helpful",
      dynamic: "",
      afterHistory: [],
      sendHistory: true,
      trace: {
        staticSections: ["main_prompt"],
        dynamicSections: [],
        worldInfoIncluded: 0,
        worldInfoDropped: [],
        matchedKeys: [],
        compactSummaryIncluded: false,
        memoryIncluded: false,
        guidedInstructionIncluded: false,
        staticCacheBusters: [],
        chatInjectionsIncluded: 0,
        afterHistorySections: [],
        overrideSources: { mainPrompt: "room override" },
      },
    },
    trace: {
      staticSections: ["main_prompt"],
      dynamicSections: [],
      worldInfoIncluded: 0,
      worldInfoDropped: [],
      matchedKeys: [],
      compactSummaryIncluded: false,
      memoryIncluded: false,
      guidedInstructionIncluded: false,
      staticCacheBusters: [],
      chatInjectionsIncluded: 0,
      afterHistorySections: [],
      overrideSources: { mainPrompt: "room override" },
    },
  };

  test("a thin pass-through: chatId reaches the verb with the resolved Principal; the preview+trace return verbatim", async () => {
    const previewAssembly = vi.fn<ChatService["previewAssembly"]>(async () => Preview);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { previewAssembly } },
    });

    const result = await caller(ctx).chat.previewAssembly({ chatId: CHAT });

    expect(previewAssembly).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual(Preview);
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (the host-only debug-surface gate)", async () => {
    const previewAssembly = vi.fn<ChatService["previewAssembly"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { previewAssembly } },
    });

    await expect(caller(ctx).chat.previewAssembly({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.getShapeTrace — the content-free SHAPE trace (PD-132, host-only)", () => {
  const Trace: Awaited<ReturnType<ChatService["getShapeTrace"]>> = {
    multiCharacter: false,
    stageCounts: { withTail: 2, injected: 2, squashed: 2, named: 2 },
    squashMerges: 0,
    cacheBreakpointFromEnd: 1,
    breakpointDecision: "placed",
  };

  test("a thin pass-through: chatId + speakerCharacterId reach the verb with the resolved Principal", async () => {
    const getShapeTrace = vi.fn<ChatService["getShapeTrace"]>(async () => Trace);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { getShapeTrace } },
    });

    const result = await caller(ctx).chat.getShapeTrace({ chatId: CHAT });

    expect(getShapeTrace).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual(Trace);
  });

  test("a non-host gets the verb's refusal (the host-only inspector gate)", async () => {
    const getShapeTrace = vi.fn<ChatService["getShapeTrace"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { getShapeTrace } },
    });

    await expect(caller(ctx).chat.getShapeTrace({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.setChatInjection / listChatInjections / deleteChatInjection — the manual-injections CRUD (task #28 wire-through)", () => {
  const InjectionId = castId<ChatInjectionId>("chat_injection_1");
  const InjectionView: Awaited<ReturnType<ChatService["listChatInjections"]>>[number] = {
    id: InjectionId,
    position: "in_chat",
    depth: 2,
    role: "system",
    content: "Remember: it is raining.",
  };

  test("setChatInjection CREATE (no id): the authored fields reach the verb with the resolved Principal", async () => {
    const setChatInjection = vi.fn<ChatService["setChatInjection"]>(async () => InjectionView);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setChatInjection } },
    });

    const result = await caller(ctx).chat.setChatInjection({
      chatId: CHAT,
      position: "in_chat",
      depth: 2,
      role: "system",
      content: "Remember: it is raining.",
    });

    expect(setChatInjection).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      position: "in_chat",
      depth: 2,
      role: "system",
      content: "Remember: it is raining.",
    });
    expect(result).toEqual(InjectionView);
  });

  test("setChatInjection UPDATE (id present): the id reaches the verb (upsert)", async () => {
    const setChatInjection = vi.fn<ChatService["setChatInjection"]>(async () => InjectionView);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setChatInjection } },
    });

    await caller(ctx).chat.setChatInjection({
      chatId: CHAT,
      id: InjectionId,
      position: "before_prompt",
      depth: 0,
      role: "user",
      content: "updated",
    });

    expect(setChatInjection).toHaveBeenCalledWith(expect.objectContaining({ chatId: CHAT, id: InjectionId, position: "before_prompt" }));
  });

  test("setChatInjection rejects an off-axis position before the verb (the wire enum)", async () => {
    const setChatInjection = vi.fn<ChatService["setChatInjection"]>(async () => InjectionView);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setChatInjection } },
    });

    await expect(
      caller(ctx).chat.setChatInjection({
        chatId: CHAT,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-enum to prove the wire schema rejects it.
        position: "somewhere" as any,
        depth: 0,
        role: "system",
        content: "x",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(setChatInjection).not.toHaveBeenCalled();
  });

  test("listChatInjections: a thin pass-through returning the splice-ordered list (member-gated)", async () => {
    const listChatInjections = vi.fn<ChatService["listChatInjections"]>(async () => [InjectionView]);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { listChatInjections } },
    });

    const result = await caller(ctx).chat.listChatInjections({ chatId: CHAT });

    expect(listChatInjections).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual([InjectionView]);
  });

  test("deleteChatInjection: chatId/injectionId reach the verb with the resolved Principal (host-only)", async () => {
    const deleteChatInjection = vi.fn<ChatService["deleteChatInjection"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { deleteChatInjection } },
    });

    const result = await caller(ctx).chat.deleteChatInjection({
      chatId: CHAT,
      injectionId: InjectionId,
    });

    expect(deleteChatInjection).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      injectionId: InjectionId,
    });
    expect(result).toBeUndefined();
  });

  test("a non-host deleting an injection gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const deleteChatInjection = vi.fn<ChatService["deleteChatInjection"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { deleteChatInjection } },
    });

    await expect(caller(ctx).chat.deleteChatInjection({ chatId: CHAT, injectionId: InjectionId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// The group-roster-controls cluster (task #29 — the cast bar + per-member controls): the two per-member
// setters + forceCharacterTurn were fully implemented in domain/chat (verbs/roster.ts + verbs/turn.ts),
// host-gated via substrate/auth/matrix.ts, but never exposed on this router (the same MISSING-API shape
// the #28 cluster was in). Thin pass-throughs; the leak-free NOT_FOUND collapse is the verb's own gate.

const CHARACTER = castId<CharacterId>("character_aria");

// A minimal ParticipantView the knob setter returns — only the mutated field is asserted; the rest is
// the shape's filler (the same posture the MESSAGE/ForkResult fixtures take).
const PARTICIPANT: Awaited<ReturnType<ChatService["setSeatKnobs"]>> = {
  id: castId<ChatParticipantId>("chat_participant_1"),
  chatId: CHAT,
  kind: "character",
  userId: null,
  characterId: CHARACTER,
  role: "member",
  activePersonaId: null,
  talkativeness: 0.5,
  disabled: false,
  joinedAt: 0,
  joinSeq: 1,
  leftSeq: null,
  joinHistoryVisibility: "from-join",
  displayName: "Aria",
  handle: null,
  avatarAssetId: null,
  avatarHash: null,
};

const PARTICIPANT_ID = castId<ChatParticipantId>("chat_participant_1");

describe("chat.setSeatKnobs — the ONE participantId-keyed AI-seat knob setter (D80 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/participantId/patch reach the verb with the resolved Principal", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>(async () => ({ ...PARTICIPANT, disabled: true, talkativeness: 0.8 }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    const result = await caller(ctx).chat.setSeatKnobs({
      chatId: CHAT,
      participantId: PARTICIPANT_ID,
      patch: { disabled: true, talkativeness: 0.8 },
    });

    expect(setSeatKnobs).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      participantId: PARTICIPANT_ID,
      patch: { disabled: true, talkativeness: 0.8 },
    });
    expect(result.disabled).toBe(true);
    expect(result.talkativeness).toBe(0.8);
  });

  test("an empty patch is legal at the wire (both knobs optional)", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>(async () => PARTICIPANT);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    await caller(ctx).chat.setSeatKnobs({ chatId: CHAT, participantId: PARTICIPANT_ID, patch: {} });
    expect(setSeatKnobs).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      participantId: PARTICIPANT_ID,
      patch: {},
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    await expect(caller(ctx).chat.setSeatKnobs({ chatId: CHAT, participantId: PARTICIPANT_ID, patch: { disabled: true } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("an out-of-range talkativeness is rejected at the wire before the verb (seatKnobsSchema clamp)", async () => {
    const setSeatKnobs = vi.fn<ChatService["setSeatKnobs"]>(async () => PARTICIPANT);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setSeatKnobs } },
    });

    await expect(caller(ctx).chat.setSeatKnobs({ chatId: CHAT, participantId: PARTICIPANT_ID, patch: { talkativeness: 1.5 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(setSeatKnobs).not.toHaveBeenCalled();
  });
});

describe("chat.forceCharacterTurn — the host summons a member to speak next (task #29 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/characterId reach the verb with the resolved Principal", async () => {
    const forceCharacterTurn = vi.fn<ChatService["forceCharacterTurn"]>(async () => ({
      messages: [MESSAGE],
      aborted: false,
    }));
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { forceCharacterTurn } },
    });

    const result = await caller(ctx).chat.forceCharacterTurn({
      chatId: CHAT,
      characterId: CHARACTER,
    });

    expect(forceCharacterTurn).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      characterId: CHARACTER,
    });
    expect(result.messages).toEqual([MESSAGE]);
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const forceCharacterTurn = vi.fn<ChatService["forceCharacterTurn"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { forceCharacterTurn } },
    });

    await expect(caller(ctx).chat.forceCharacterTurn({ chatId: CHAT, characterId: CHARACTER })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chat.updateTitle — the LIST-row rename verb (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/title reach the verb with the resolved Principal", async () => {
    const updateTitle = vi.fn<ChatService["updateTitle"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { updateTitle } },
    });

    const result = await caller(ctx).chat.updateTitle({ chatId: CHAT, title: "A new title" });

    expect(updateTitle).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      title: "A new title",
    });
    expect(result).toBeUndefined();
  });

  test("a null title clears it (the wire accepts string | null)", async () => {
    const updateTitle = vi.fn<ChatService["updateTitle"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { updateTitle } },
    });

    await caller(ctx).chat.updateTitle({ chatId: CHAT, title: null });

    expect(updateTitle).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      title: null,
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const updateTitle = vi.fn<ChatService["updateTitle"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { updateTitle } },
    });

    await expect(caller(ctx).chat.updateTitle({ chatId: CHAT, title: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.star — the LIST-row star toggle (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/star reach the verb with the resolved Principal", async () => {
    const star = vi.fn<ChatService["star"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { star } },
    });

    await caller(ctx).chat.star({ chatId: CHAT, star: true });

    expect(star).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      star: true,
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const star = vi.fn<ChatService["star"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { star } },
    });

    await expect(caller(ctx).chat.star({ chatId: CHAT, star: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.archive — the LIST-row archive toggle (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId/archived reach the verb with the resolved Principal", async () => {
    const archive = vi.fn<ChatService["archive"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { archive } },
    });

    await caller(ctx).chat.archive({ chatId: CHAT, archived: true });

    expect(archive).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      archived: true,
    });
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const archive = vi.fn<ChatService["archive"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { archive } },
    });

    await expect(caller(ctx).chat.archive({ chatId: CHAT, archived: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.delete — the LIST-row delete verb (J5 wire-through, host-only)", () => {
  test("a thin pass-through: chatId reaches the verb with the resolved Principal", async () => {
    const del = vi.fn<ChatService["delete"]>(async () => undefined);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { delete: del } },
    });

    const result = await caller(ctx).chat.delete({ chatId: CHAT });

    expect(del).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toBeUndefined();
  });

  test("a non-host gets the verb's leak-free NOT_FOUND (requireHost gate)", async () => {
    const del = vi.fn<ChatService["delete"]>().mockRejectedValue(new ChatNotFoundError(CHAT));
    const ctx = makeContext({
      auth: principal("user", { userId: NON_MEMBER }),
      services: { chat: { delete: del } },
    });

    await expect(caller(ctx).chat.delete({ chatId: CHAT })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("chat.getGroupConfig / chat.setGroupConfig — the group-config wire-through (domain-ahead-of-transport)", () => {
  test("setGroupConfig: a thin pass-through — chatId + the PARSED config reach the verb with the Principal", async () => {
    const setGroupConfig = vi.fn<ChatService["setGroupConfig"]>(async () => DEFAULT_GROUP_CONFIG);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { setGroupConfig } },
    });
    await caller(ctx).chat.setGroupConfig({
      chatId: CHAT,
      config: { output: "narrator", policy: "natural" },
    });
    expect(setGroupConfig).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
      // The wire `groupConfigSchema` fully-defaults the lenient input before the verb (narrator ⇒ speakerTags true).
      config: expect.objectContaining({ output: "narrator", policy: "natural", speakerTags: true }),
    });
  });

  test("getGroupConfig: a thin pass-through — chatId reaches the verb; the effective config returns", async () => {
    const getGroupConfigForChat = vi.fn<ChatService["getGroupConfigForChat"]>(async () => DEFAULT_GROUP_CONFIG);
    const ctx = makeContext({
      auth: principal("user", { userId: MEMBER }),
      services: { chat: { getGroupConfigForChat } },
    });
    const result = await caller(ctx).chat.getGroupConfig({ chatId: CHAT });
    expect(getGroupConfigForChat).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: MEMBER }),
      chatId: CHAT,
    });
    expect(result).toEqual(DEFAULT_GROUP_CONFIG);
  });
});
