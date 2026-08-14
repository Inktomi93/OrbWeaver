// Behavioral contract for `applyChatBusEvent` (UI-Gates §11.1) — the pure exhaustive bus reducer.
// Real store (`chatStream`), spy deps: `deps.stream` wraps the ACTUAL chat-stream API in `vi.fn` so
// assertions can check both "was the right store method called with the right args" AND "did the real
// slot machine reach the right terminal" (never a parallel fake store — Spine-Testing.md §3 mock
// doctrine: fake at the edges, inject at the root, the store itself is the root here).
//
// Coverage: one case per stream-transient/terminal event class (§ the reducer's first switch group),
// then a single loop-generated case per CANON event — driven from `CHAT_BUS_EVENT_TYPES` (the contract's
// own exhaustive member list) minus the stream-transient set, so a NEW future `ChatBusEvent` member fails
// this file loudly (both the `buildCanonEvent` switch — compile-time — and the generated `test()` —
// runtime) exactly like the reducer's own `assertNever` discipline.

import type { ChatBusDeps } from "@orb/client/data/bus";
import { applyChatBusEvent } from "@orb/client/data/bus";
import type { TurnSlot } from "@orb/client/state";
import { chatStream, subscribeTurnSlot } from "@orb/client/state";
import type { ChatBusEvent, ChatDeltaEvent, ChatWarningCode, TurnIntent } from "@orb/contracts/chat";
import { CHAT_BUS_EVENT_TYPES } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId, PersonaId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { makeMessageView } from "../../features/chat/fixtures.ts";

// ── Harness: real store, spy-wrapped deps ──────────────────────────────────────────────────────────

interface Harness {
  readonly deps: ChatBusDeps;
  readonly invalidate: ReturnType<typeof vi.fn<(event: ChatBusEvent) => void>>;
  readonly onWarning: ReturnType<typeof vi.fn<(code: ChatWarningCode, chatId: ChatId) => void>>;
  readonly beginTurn: ReturnType<typeof vi.fn<typeof chatStream.beginTurn>>;
  readonly appendDelta: ReturnType<typeof vi.fn<typeof chatStream.appendDelta>>;
  readonly completeTurn: ReturnType<typeof vi.fn<typeof chatStream.completeTurn>>;
  readonly abortTurn: ReturnType<typeof vi.fn<typeof chatStream.abortTurn>>;
  readonly notifyUserMessageCommitted: ReturnType<typeof vi.fn<typeof chatStream.notifyUserMessageCommitted>>;
  readonly markCommitted: ReturnType<typeof vi.fn<typeof chatStream.markCommitted>>;
  /** Latest slot snapshot for `chatId`, updated via a real `subscribeTurnSlot`. */
  readonly slotOf: (chatId: ChatId) => TurnSlot | undefined;
  readonly unsub: () => void;
}

function harness(chatIds: readonly ChatId[]): Harness {
  const slots = new Map<ChatId, TurnSlot>();
  const unsubs = chatIds.map((chatId) =>
    subscribeTurnSlot(chatId, (slot) => {
      slots.set(chatId, slot);
    }),
  );
  const beginTurn = vi.fn(chatStream.beginTurn);
  const appendDelta = vi.fn(chatStream.appendDelta);
  const completeTurn = vi.fn(chatStream.completeTurn);
  const abortTurn = vi.fn(chatStream.abortTurn);
  const notifyUserMessageCommitted = vi.fn(chatStream.notifyUserMessageCommitted);
  const markCommitted = vi.fn(chatStream.markCommitted);
  const invalidate = vi.fn((_event: ChatBusEvent): void => undefined);
  const onWarning = vi.fn((_code: ChatWarningCode, _chatId: ChatId): void => undefined);
  const deps: ChatBusDeps = {
    stream: {
      beginTurn,
      appendDelta,
      completeTurn,
      abortTurn,
      notifyUserMessageCommitted,
      markCommitted,
      // The reducer never calls this (markStopping is the ONE component-callable exception — see
      // state/chat-stream.ts's header) but `ChatBusDeps.stream` is typed as the full `ChatStreamApi`,
      // so the harness literal needs the field to satisfy the type. Real impl, unused by this suite.
      markStopping: chatStream.markStopping,
    },
    invalidate,
    onWarning,
  };
  return {
    deps,
    invalidate,
    onWarning,
    beginTurn,
    appendDelta,
    completeTurn,
    abortTurn,
    notifyUserMessageCommitted,
    markCommitted,
    slotOf: (chatId): TurnSlot | undefined => slots.get(chatId),
    unsub: (): void => {
      for (const u of unsubs) {
        u();
      }
    },
  };
}

let uniq = 0;
function freshChatId(): ChatId {
  uniq += 1;
  return castId<ChatId>(`chat_test_bus_${String(uniq).padStart(6, "0")}`);
}

const MESSAGE_ID = castId<MessageId>("message_test_bus_0001");
const CHARACTER_ID = castId<CharacterId>("character_test_bus_01");
const PERSONA_ID = castId<PersonaId>("persona_test_bus_0001");
const WORLD_BOOK_ID = castId<WorldBookId>("world_book_test_bus01");
const WORLD_ENTRY_ID = castId<WorldEntryId>("world_entry_test_bus1");

/** A minimally-valid `turnStarted` event — `api`/`source`/`model` are the connection-selection axes
 *  (`@orb/contracts/connection`), irrelevant to the reducer's routing but required by the real
 *  `ChatBusEvent` shape; fixed values keep every case that needs one identical bar the fields under test. */
function turnStartedEvent(overrides: {
  chatId: ChatId;
  intent: TurnIntent;
  speakerCharacterId: CharacterId | null;
  targetMessageId: MessageId | null;
}): ChatBusEvent {
  return {
    type: "turnStarted",
    chatId: overrides.chatId,
    intent: overrides.intent,
    api: "chat-completions",
    source: "openrouter",
    model: "test-model",
    speakerCharacterId: overrides.speakerCharacterId,
    targetMessageId: overrides.targetMessageId,
  };
}

// ── Stream-transient / terminal event classes (one case each) ──────────────────────────────────────

describe("applyChatBusEvent — stream-transient events", () => {
  test("delta → stream.appendDelta receives the payload; slot buffers it; invalidate not called", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    applyChatBusEvent(
      turnStartedEvent({
        chatId,
        intent: "send",
        speakerCharacterId: CHARACTER_ID,
        targetMessageId: null,
      }),
      h.deps,
    );
    const delta: ChatDeltaEvent = { chatId, kind: "text", text: "hel" };

    // `slotSeq` is the SERVER-side D16 clamp anchor; the reducer forwards only the inner chunk.
    applyChatBusEvent({ type: "delta", chatId, slotSeq: 1, delta }, h.deps);

    expect(h.appendDelta).toHaveBeenCalledExactlyOnceWith(delta);
    expect(h.slotOf(chatId)).toMatchObject({ phase: "streaming", text: "hel" });
    expect(h.invalidate).not.toHaveBeenCalled();
    h.unsub();
  });

  test("turnStarted → stream.beginTurn(chatId, {intent,speakerCharacterId,targetMessageId}); slot → pending; invalidate not called", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    const event = turnStartedEvent({
      chatId,
      intent: "swipe",
      speakerCharacterId: CHARACTER_ID,
      targetMessageId: MESSAGE_ID,
    });

    applyChatBusEvent(event, h.deps);

    expect(h.beginTurn).toHaveBeenCalledExactlyOnceWith(chatId, {
      intent: "swipe",
      speakerCharacterId: CHARACTER_ID,
      targetMessageId: MESSAGE_ID,
    });
    expect(h.slotOf(chatId)).toMatchObject({
      phase: "pending",
      intent: "swipe",
      speakerCharacterId: CHARACTER_ID,
      targetMessageId: MESSAGE_ID,
    });
    expect(h.invalidate).not.toHaveBeenCalled();
    h.unsub();
  });

  test("turnAccepted → stream.beginTurn(null speaker); slot → pending (Stop can render); invalidate not called", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);

    // Accept fires BEFORE arbitration — the slot must open so Stop renders while the smart arbiter is deciding.
    applyChatBusEvent({ type: "turnAccepted", chatId, intent: "send", speakerCharacterId: null, targetMessageId: null }, h.deps);

    expect(h.beginTurn).toHaveBeenCalledExactlyOnceWith(chatId, {
      intent: "send",
      speakerCharacterId: null,
      targetMessageId: null,
    });
    expect(h.slotOf(chatId)).toMatchObject({ phase: "pending", intent: "send", speakerCharacterId: null });
    expect(h.invalidate).not.toHaveBeenCalled();
    h.unsub();
  });

  test("turnAccepted → turnStarted re-opens the same pending slot with the arbitration-resolved speaker", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);

    applyChatBusEvent({ type: "turnAccepted", chatId, intent: "send", speakerCharacterId: null, targetMessageId: null }, h.deps);
    applyChatBusEvent(turnStartedEvent({ chatId, intent: "send", speakerCharacterId: CHARACTER_ID, targetMessageId: null }), h.deps);

    // The slot stays pending across accept→started, now carrying the speaker arbitration picked.
    expect(h.slotOf(chatId)).toMatchObject({ phase: "pending", intent: "send", speakerCharacterId: CHARACTER_ID });
    expect(h.invalidate).not.toHaveBeenCalled();
    h.unsub();
  });

  test("reasoningStreamDone → no-op: no store mutation, no invalidate", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    applyChatBusEvent(turnStartedEvent({ chatId, intent: "send", speakerCharacterId: null, targetMessageId: null }), h.deps);

    applyChatBusEvent({ type: "reasoningStreamDone", chatId }, h.deps);

    expect(h.appendDelta).not.toHaveBeenCalled();
    expect(h.completeTurn).not.toHaveBeenCalled();
    expect(h.abortTurn).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.slotOf(chatId)).toMatchObject({ phase: "pending" });
    h.unsub();
  });

  test("warning → onWarning(code, chatId); no invalidate", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);

    applyChatBusEvent({ type: "warning", chatId, code: "image_dropped" }, h.deps);

    expect(h.onWarning).toHaveBeenCalledExactlyOnceWith("image_dropped", chatId);
    expect(h.invalidate).not.toHaveBeenCalled();
    h.unsub();
  });
});

describe("applyChatBusEvent — turn terminals", () => {
  test("turnCompleted → stream.completeTurn(chatId, messageId); slot reaches 'completed'; invalidate(event) called once", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    applyChatBusEvent(turnStartedEvent({ chatId, intent: "send", speakerCharacterId: null, targetMessageId: null }), h.deps);
    const event: ChatBusEvent = {
      type: "turnCompleted",
      chatId,
      intent: "send",
      messageId: MESSAGE_ID,
    };

    applyChatBusEvent(event, h.deps);

    expect(h.completeTurn).toHaveBeenCalledExactlyOnceWith(chatId, MESSAGE_ID);
    expect(h.slotOf(chatId)).toMatchObject({ phase: "completed", messageId: MESSAGE_ID });
    expect(h.invalidate).toHaveBeenCalledExactlyOnceWith(event);
    h.unsub();
  });

  test("turnAborted → stream.abortTurn(chatId, reason); slot reaches 'aborted'; invalidate(event) called once", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    applyChatBusEvent(turnStartedEvent({ chatId, intent: "send", speakerCharacterId: null, targetMessageId: null }), h.deps);
    const event: ChatBusEvent = { type: "turnAborted", chatId, intent: "send", reason: "stale", automationDepth: 0 };

    applyChatBusEvent(event, h.deps);

    expect(h.abortTurn).toHaveBeenCalledExactlyOnceWith(chatId, "stale");
    expect(h.slotOf(chatId)).toMatchObject({ phase: "aborted", reason: "stale" });
    expect(h.invalidate).toHaveBeenCalledExactlyOnceWith(event);
    h.unsub();
  });
});

// ── messageCommitted's clear-on-commit split (the composer's draft-clear correlation) ───────────────
// A canon event (always invalidates), but ALSO fires the user-message-committed signal — gated to a
// USER-role view so the assistant's own later `messageCommitted` (same chat, same turn) can't falsely
// clear the composer, and gated to a present view (absent ⇒ inconclusive ⇒ don't clear).

describe("applyChatBusEvent — messageCommitted clear-on-commit signal", () => {
  test("a USER-role committed view fires the commit signal for chatId AND invalidates", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    const event: ChatBusEvent = {
      type: "messageCommitted",
      chatId,
      messageId: MESSAGE_ID,
      view: makeMessageView({ id: MESSAGE_ID, chatId, role: "user" }),
    };

    applyChatBusEvent(event, h.deps);

    expect(h.notifyUserMessageCommitted).toHaveBeenCalledExactlyOnceWith(chatId);
    expect(h.invalidate).toHaveBeenCalledExactlyOnceWith(event);
    h.unsub();
  });

  test("an ASSISTANT-role committed view invalidates but does NOT fire the signal (no false clear)", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    const event: ChatBusEvent = {
      type: "messageCommitted",
      chatId,
      messageId: MESSAGE_ID,
      view: makeMessageView({ id: MESSAGE_ID, chatId, role: "assistant" }),
    };

    applyChatBusEvent(event, h.deps);

    expect(h.notifyUserMessageCommitted).not.toHaveBeenCalled();
    expect(h.invalidate).toHaveBeenCalledExactlyOnceWith(event);
    h.unsub();
  });

  // ── The GHOST HANDOVER stamp (the tail-flash fix's slot half) ────────────────────────────────────
  // An ASSISTANT commit inside a LIVE turn is that turn's own output landing in canon, and the same event's
  // `view` carrier is applied to the message list by the seam — so the slot records the row id and the ghost
  // yields to it (`use-message-items.ts`), instead of holding to `turnCompleted` and unmounting onto a row
  // the refetch has not replaced yet. The USER arm is the one that must NOT stamp: the caller's own prompt
  // commits inside this same live slot on a send, and standing it down as the turn's output would blank the
  // ghost for the whole turn.

  test("an ASSISTANT commit inside a LIVE turn stamps committedMessageId on the slot (the ghost's handover)", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    applyChatBusEvent(turnStartedEvent({ chatId, intent: "send", speakerCharacterId: null, targetMessageId: null }), h.deps);

    applyChatBusEvent(
      { type: "messageCommitted", chatId, messageId: MESSAGE_ID, view: makeMessageView({ id: MESSAGE_ID, chatId, role: "assistant" }) },
      h.deps,
    );

    expect(h.markCommitted).toHaveBeenCalledExactlyOnceWith(chatId, MESSAGE_ID);
    expect(h.slotOf(chatId)).toMatchObject({ phase: "pending", committedMessageId: MESSAGE_ID });
  });

  test("a USER commit inside a LIVE turn does NOT stamp (the send's own prompt is not the turn's output)", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    applyChatBusEvent(turnStartedEvent({ chatId, intent: "send", speakerCharacterId: null, targetMessageId: null }), h.deps);

    applyChatBusEvent({ type: "messageCommitted", chatId, messageId: MESSAGE_ID, view: makeMessageView({ id: MESSAGE_ID, chatId, role: "user" }) }, h.deps);

    expect(h.markCommitted).not.toHaveBeenCalled();
    expect(h.slotOf(chatId)).toMatchObject({ phase: "pending", committedMessageId: null });
  });

  test("an ASSISTANT commit with NO live turn leaves the store untouched (somebody else's write)", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);

    applyChatBusEvent(
      { type: "messageCommitted", chatId, messageId: MESSAGE_ID, view: makeMessageView({ id: MESSAGE_ID, chatId, role: "assistant" }) },
      h.deps,
    );

    expect(h.markCommitted).toHaveBeenCalledExactlyOnceWith(chatId, MESSAGE_ID);
    // No slot was ever created — the action is an idempotent no-op off-turn (a narrator post, another
    // device's edit): there is no ghost to hand over to, and the canon refetch owns the row.
    expect(h.slotOf(chatId)).toBeUndefined();
  });

  test("a view-less messageCommitted invalidates but does NOT fire the signal (inconclusive ⇒ don't clear)", () => {
    const chatId = freshChatId();
    const h = harness([chatId]);
    const event: ChatBusEvent = { type: "messageCommitted", chatId, messageId: MESSAGE_ID };

    applyChatBusEvent(event, h.deps);

    expect(h.notifyUserMessageCommitted).not.toHaveBeenCalled();
    expect(h.invalidate).toHaveBeenCalledExactlyOnceWith(event);
    h.unsub();
  });
});

// ── Canon / attachment / lifecycle events — driven from the contract's own exhaustive list ─────────
// The reducer routes every one of these through `deps.invalidate(event)` with NO stream-store touch.
// STREAM_TRANSIENT names the 6 members handled above; everything else in `CHAT_BUS_EVENT_TYPES` is
// "canon" by construction, so a newly-added `ChatBusEvent` member automatically gets a generated test
// here (and fails `buildCanonEvent`'s exhaustive switch below at compile time until taught its shape).

const STREAM_TRANSIENT = new Set(["delta", "turnAccepted", "turnStarted", "reasoningStreamDone", "warning", "turnCompleted", "turnAborted"]);

type CanonEventType = Exclude<
  ChatBusEvent["type"],
  "delta" | "turnAccepted" | "turnStarted" | "reasoningStreamDone" | "warning" | "turnCompleted" | "turnAborted"
>;

function assertNeverCanon(value: never): never {
  throw new Error(`buildCanonEvent: unhandled canon event type ${JSON.stringify(value)}`);
}

function buildCanonEvent(type: CanonEventType, chatId: ChatId): ChatBusEvent {
  switch (type) {
    case "messageCommitted":
    case "messageEdited":
    case "messageHidden":
    case "variantSelected":
    case "reasoningEdited":
    case "reasoningCleared":
      return { type, chatId, messageId: MESSAGE_ID };
    case "messagesDeleted":
      return { type, chatId, messageIds: [MESSAGE_ID] };
    case "messagesReordered":
    case "chatCreated":
    case "chatDeleted":
    case "chatOpened":
    case "historyTruncated":
    case "chatUpdated":
      return { type, chatId };
    case "worldInfoActivated":
      return { type, chatId, entryIds: [WORLD_ENTRY_ID] };
    case "personaSwitched":
      return { type, chatId, from: null, to: PERSONA_ID };
    case "wiBookAttached":
    case "wiBookDetached":
      return { type, chatId, surface: "chat", bookId: WORLD_BOOK_ID };
    case "wiEntryAttached":
      return { type, chatId, surface: "chat", entryId: WORLD_ENTRY_ID, scope: "always" };
    case "wiEntryDetached":
      return { type, chatId, surface: "chat", entryId: WORLD_ENTRY_ID };

    case "wiEntryScopeChanged":
      return { type, chatId, surface: "chat", entryId: WORLD_ENTRY_ID, scope: "keyword" };
    // The entity→room bridge: invalidate-only, exactly like `chatUpdated`. It reaches the reducer through
    // the LIVE-ONLY lane (no durable seq), which is the seq guard's concern, not this reducer's.
    case "roomEntityChanged":
      return { type, chatId, entity: "character" };
    default:
      return assertNeverCanon(type);
  }
}

const CANON_TYPES = Object.keys(CHAT_BUS_EVENT_TYPES).filter((t): t is CanonEventType => !STREAM_TRANSIENT.has(t));

describe("applyChatBusEvent — canon/lifecycle events (invalidate-only)", () => {
  // Sanity: the split above must actually partition the contract's full list (catches a typo in
  // STREAM_TRANSIENT silently shrinking the loop below).
  test("CANON_TYPES ∪ STREAM_TRANSIENT covers every CHAT_BUS_EVENT_TYPES member exactly once", () => {
    const all = Object.keys(CHAT_BUS_EVENT_TYPES);
    expect(CANON_TYPES.length + STREAM_TRANSIENT.size).toBe(all.length);
    expect(new Set([...CANON_TYPES, ...STREAM_TRANSIENT])).toEqual(new Set(all));
  });

  for (const type of CANON_TYPES) {
    test(`${type} → invalidate(event) called once; no stream-store mutation`, () => {
      const chatId = freshChatId();
      const h = harness([chatId]);
      const event = buildCanonEvent(type, chatId);

      applyChatBusEvent(event, h.deps);

      expect(h.invalidate).toHaveBeenCalledExactlyOnceWith(event);
      expect(h.beginTurn).not.toHaveBeenCalled();
      expect(h.appendDelta).not.toHaveBeenCalled();
      expect(h.completeTurn).not.toHaveBeenCalled();
      expect(h.abortTurn).not.toHaveBeenCalled();
      expect(h.onWarning).not.toHaveBeenCalled();
      // No slot was ever created for this chat (idle stays untracked — `slotOf` never fired).
      expect(h.slotOf(chatId)).toBeUndefined();
      h.unsub();
    });
  }
});
