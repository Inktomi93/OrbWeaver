// The stream-slot DU machine: transitions are replace-semantics (no stale field bleeds across
// phases), deltas accumulate per kind, terminals own the lifecycle, and the "no turn" read is the
// STABLE IDLE_TURN reference (the v5 Object.is selector contract).

import type { TurnSlot } from "@orb/client/state";
import { chatStream, IDLE_TURN, subscribeTurnSlot } from "@orb/client/state";
import type { ChatDeltaEvent, TurnIntent } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const CHAT_A = castId<ChatId>("chat_teststreamaaaa");
const CHAT_B = castId<ChatId>("chat_teststreambbbb");
const MSG = castId<MessageId>("msg_teststreamaaaaa");
const SEND: TurnIntent = "send";

function begin(chatId: ChatId): void {
  chatStream.beginTurn(chatId, { intent: SEND, speakerCharacterId: null, targetMessageId: null });
}

function textDelta(chatId: ChatId, text: string): ChatDeltaEvent {
  return { chatId, kind: "text", text };
}

describe("chatStream turn slots", () => {
  test("begin → pending; first delta → streaming; deltas accumulate per kind", () => {
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(CHAT_A, (slot) => seen.push(slot));

    begin(CHAT_A);
    chatStream.appendDelta(textDelta(CHAT_A, "Hel"));
    chatStream.appendDelta(textDelta(CHAT_A, "lo"));
    chatStream.appendDelta({ chatId: CHAT_A, kind: "reasoning", text: "thinking" });

    const last = seen.at(-1);
    expect(last).toMatchObject({ phase: "streaming", text: "Hello", reasoning: "thinking" });
    expect(seen[0]?.phase).toBe("pending");

    chatStream.completeTurn(CHAT_A, MSG);
    const done = seen.at(-1);
    expect(done?.phase).toBe("completed");
    // Replace semantics: the completed slot carries NO streaming fields.
    expect(done !== undefined && "text" in done).toBe(false);

    chatStream.clearTurn(CHAT_A);
    expect(seen.at(-1)).toBe(IDLE_TURN); // the STABLE reference, not a fresh {phase:"idle"}
    unsub();
  });

  test("abort from pending; per-chat isolation; delta without a live turn is dropped", () => {
    const seenB: TurnSlot[] = [];
    const unsubB = subscribeTurnSlot(CHAT_B, (slot) => seenB.push(slot));

    begin(CHAT_B);
    chatStream.abortTurn(CHAT_B, "user");
    expect(seenB.at(-1)).toMatchObject({ phase: "aborted", reason: "user" });

    // A raced delta after the terminal must not resurrect a slot.
    chatStream.appendDelta(textDelta(CHAT_B, "late"));
    expect(seenB.at(-1)?.phase).toBe("aborted");

    // CHAT_A (cleared in the prior test) stayed untouched by CHAT_B's lifecycle.
    let current: TurnSlot | null = null;
    const unsubA = subscribeTurnSlot(CHAT_A, (slot) => {
      current = slot;
    });
    begin(CHAT_A);
    chatStream.clearTurn(CHAT_A);
    expect(current).toBe(IDLE_TURN);
    unsubA();
    chatStream.clearTurn(CHAT_B);
    unsubB();
  });
});
