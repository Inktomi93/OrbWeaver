// The stream-slot DU machine: transitions are replace-semantics (no stale field bleeds across
// phases), deltas accumulate per kind, terminals own the lifecycle. Plus the user-message-committed
// SIGNAL (the composer's clear-on-commit correlation) — a render-free per-chat listener set, not a slot.
//
// Every test mints a FRESH chat id (`freshChatId`) so the module-singleton store needs no inter-test
// reset — there is no `clearTurn` (removed as dead API; a terminal slot just lingers until the next
// `beginTurn`, and a fresh id never collides with a prior test's lingering slot).

import type { TurnSlot } from "@orb/client/state";
import { __setFrameSchedulerForTest, chatStream, subscribeTurnSlot, subscribeUserMessageCommitted } from "@orb/client/state";
import type { ChatDeltaEvent, TurnIntent } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures";

const MSG = castId<MessageId>("msg_teststreamaaaaa");
const SEND: TurnIntent = "send";

let uniq = 0;
/** A fresh per-test chat id so the module-singleton store carries no cross-test state (no clearTurn). */
function freshChatId(): ChatId {
  uniq += 1;
  return castId<ChatId>(`chat_teststream_${String(uniq).padStart(5, "0")}`);
}

function begin(chatId: ChatId): void {
  chatStream.beginTurn(chatId, { intent: SEND, speakerCharacterId: null, targetMessageId: null });
}

function textDelta(chatId: ChatId, text: string): ChatDeltaEvent {
  return { chatId, kind: "text", text };
}

describe("chatStream turn slots", () => {
  test("begin → pending; first delta → streaming; deltas accumulate per kind", () => {
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    begin(chatId);
    chatStream.appendDelta(textDelta(chatId, "Hel"));
    chatStream.appendDelta(textDelta(chatId, "lo"));
    chatStream.appendDelta({ chatId, kind: "reasoning", text: "thinking" });

    const last = seen.at(-1);
    expect(last).toMatchObject({ phase: "streaming", text: "Hello", reasoning: "thinking" });
    expect(seen[0]?.phase).toBe("pending");

    chatStream.completeTurn(chatId, MSG);
    const done = seen.at(-1);
    expect(done?.phase).toBe("completed");
    // Replace semantics: the completed slot carries NO streaming fields.
    expect(done !== undefined && "text" in done).toBe(false);
    unsub();
  });

  test("completed → beginTurn RE-OPENS to pending (the auto-mode chain's next-speaker turnAccepted)", () => {
    // A chained AI→AI turn (or a manual regenerate) re-opens a slot that already reached a terminal: the bus
    // reducer routes the continuation's `turnAccepted` to `beginTurn`, which is unconditional BY DESIGN. This
    // is the client half of the chain-arbitration Stop-affordance fix — the slot re-opens so Stop renders
    // through the continuation's arbitration instead of sitting idle after the human round completed.
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    begin(chatId);
    chatStream.appendDelta(textDelta(chatId, "one"));
    chatStream.completeTurn(chatId, MSG);
    expect(seen.at(-1)?.phase).toBe("completed");

    // The chain's next-speaker accept re-opens the SAME chat's slot — completed → pending, clean (no stale text).
    begin(chatId);
    const reopened = seen.at(-1);
    expect(reopened).toMatchObject({ phase: "pending", intent: "send", speakerCharacterId: null });
    expect(reopened !== undefined && "text" in reopened).toBe(false);
    unsub();
  });

  test("abort from pending; per-chat isolation; delta without a live turn is dropped", () => {
    const chatB = freshChatId();
    const seenB: TurnSlot[] = [];
    const unsubB = subscribeTurnSlot(chatB, (slot) => seenB.push(slot));

    begin(chatB);
    chatStream.abortTurn(chatB, "user");
    expect(seenB.at(-1)).toMatchObject({ phase: "aborted", reason: "user" });

    // A raced delta after the terminal must not resurrect a slot.
    chatStream.appendDelta(textDelta(chatB, "late"));
    expect(seenB.at(-1)?.phase).toBe("aborted");

    // A DIFFERENT chat runs its own lifecycle, untouched by chatB's terminal.
    const chatA = freshChatId();
    let current: TurnSlot | null = null;
    const unsubA = subscribeTurnSlot(chatA, (slot) => {
      current = slot;
    });
    begin(chatA);
    expect(current).toMatchObject({ phase: "pending" });
    unsubA();
    unsubB();
  });
});

describe("chatStream markStopping (ADDITIVE — the composer's Stop button)", () => {
  test("streaming → markStopping → stopping, preserving accumulated text; deltas keep accumulating", () => {
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    begin(chatId);
    chatStream.appendDelta(textDelta(chatId, "Hel"));
    chatStream.markStopping(chatId);
    expect(seen.at(-1)).toMatchObject({ phase: "stopping", text: "Hel" });

    // A delta legitimately keeps arriving mid-stop — it accumulates, staying in `stopping`.
    chatStream.appendDelta(textDelta(chatId, "lo"));
    expect(seen.at(-1)).toMatchObject({ phase: "stopping", text: "Hello" });
    unsub();
  });

  test("pending → markStopping → stopping (before any token — the TTFT window)", () => {
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    begin(chatId);
    chatStream.markStopping(chatId);
    expect(seen.at(-1)).toMatchObject({ phase: "stopping", text: "", reasoning: "" });
    unsub();
  });

  test("markStopping is idempotent — a second call from `stopping` is a no-op (the double-abort guard)", () => {
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    begin(chatId);
    chatStream.markStopping(chatId);
    const afterFirst = seen.at(-1);
    chatStream.markStopping(chatId);
    expect(seen.at(-1)).toBe(afterFirst); // no new emission — store-level no-op, not just idempotent state
    unsub();
  });

  test("markStopping from idle is a no-op (nothing to stop)", () => {
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    chatStream.markStopping(chatId); // no begin() — the slot is idle/untracked
    expect(seen).toEqual([]);
    unsub();
  });

  test("completeTurn from stopping → completed (a race the server wins: turn finished right as Stop fired)", () => {
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    begin(chatId);
    chatStream.appendDelta(textDelta(chatId, "Hi"));
    chatStream.markStopping(chatId);
    chatStream.completeTurn(chatId, MSG);

    expect(seen.at(-1)).toMatchObject({ phase: "completed", messageId: MSG });
    unsub();
  });

  test("abortTurn from stopping → aborted (the server confirms the cancel — the slot closes HERE, not at markStopping)", () => {
    const chatId = freshChatId();
    const seen: TurnSlot[] = [];
    const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

    begin(chatId);
    chatStream.markStopping(chatId);
    expect(seen.at(-1)?.phase).toBe("stopping"); // still open — markStopping never closes the slot

    chatStream.abortTurn(chatId, "user");
    expect(seen.at(-1)).toMatchObject({ phase: "aborted", reason: "user" });
    unsub();
  });
});

describe("chatStream user-message-committed signal (the composer's clear-on-commit seam)", () => {
  test("notifyUserMessageCommitted fires the chat's subscribed listeners, per-chat isolated", () => {
    const chatA = freshChatId();
    const chatB = freshChatId();
    const onA = vi.fn();
    const onB = vi.fn();
    const unsubA = subscribeUserMessageCommitted(chatA, onA);
    const unsubB = subscribeUserMessageCommitted(chatB, onB);

    chatStream.notifyUserMessageCommitted(chatA);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).not.toHaveBeenCalled(); // isolated by chat id

    unsubA();
    unsubB();
  });

  test("an unsubscribed listener no longer fires (the send-hook's finally cleanup)", () => {
    const chatId = freshChatId();
    const listener = vi.fn();
    const unsub = subscribeUserMessageCommitted(chatId, listener);
    unsub();

    chatStream.notifyUserMessageCommitted(chatId);
    expect(listener).not.toHaveBeenCalled();
  });

  test("notify with no subscribers is a silent no-op (a send that failed pre-commit, listener already gone)", () => {
    const chatId = freshChatId();
    expect(() => chatStream.notifyUserMessageCommitted(chatId)).not.toThrow();
  });

  test("a listener that unsubscribes DURING notify does not corrupt the iteration (snapshot fire)", () => {
    const chatId = freshChatId();
    const calls: string[] = [];
    const unsubSelf = subscribeUserMessageCommitted(chatId, () => {
      calls.push("self");
      unsubSelf(); // remove self mid-fire — the snapshot must still complete cleanly
    });
    const unsubOther = subscribeUserMessageCommitted(chatId, () => calls.push("other"));

    chatStream.notifyUserMessageCommitted(chatId);
    expect(calls).toEqual(["self", "other"]);

    unsubOther();
  });
});

describe("chatStream rAF-batched token accumulation (task #20 — frame-cadence commits)", () => {
  test("a burst of deltas COALESCES to ONE store commit at the frame flush, byte-identical + in order", () => {
    // A manual scheduler: capture the flush callback instead of running it, so a whole burst only buffers
    // until we fire the "frame" — the exact browser rAF behavior, made deterministic. Holder-object shape:
    // a closure-mutated `let` stays flow-narrowed to its initializer at later reads (the known TS
    // limitation), which the graph program reports as never-callable; property narrowing resets on calls.
    const frame: { fn: (() => void) | null } = { fn: null };
    const restore = __setFrameSchedulerForTest((flush) => {
      frame.fn = flush;
    });
    try {
      const chatId = freshChatId();
      const commits: TurnSlot[] = [];
      const unsub = subscribeTurnSlot(chatId, (slot) => commits.push(slot));

      begin(chatId); // pending — one commit
      const beginCommits = commits.length;

      // A burst of 5 chunks arrives within one frame — they BUFFER, no store commit yet.
      for (const part of ["Hel", "lo ", "wor", "ld", "!"]) {
        chatStream.appendDelta(textDelta(chatId, part));
      }
      expect(commits.length).toBe(beginCommits); // still no delta commit — all buffered

      // The frame fires → exactly ONE commit carrying the full accumulated text, in order.
      expect(frame.fn).not.toBeNull();
      frame.fn?.();
      expect(commits.length).toBe(beginCommits + 1);
      expect(commits.at(-1)).toMatchObject({ phase: "streaming", text: "Hello world!" });

      unsub();
    } finally {
      restore();
    }
  });

  test("completeTurn flushes buffered tail tokens BEFORE the terminal (no dropped/reordered text)", () => {
    // Scheduler that never auto-fires — proves the terminal itself drains the buffer.
    const restore = __setFrameSchedulerForTest(() => undefined);
    try {
      const chatId = freshChatId();
      const seen: TurnSlot[] = [];
      const unsub = subscribeTurnSlot(chatId, (slot) => seen.push(slot));

      begin(chatId);
      chatStream.appendDelta(textDelta(chatId, "Hello "));
      chatStream.appendDelta(textDelta(chatId, "world"));
      // The frame never fired, so the tokens are still buffered — the slot is a token-less `pending`.
      expect(seen.at(-1)?.phase).toBe("pending");

      chatStream.completeTurn(chatId, MSG);
      // The terminal flushed the buffer first: a streaming commit with the full text lands, THEN completed.
      const streamingCommit = seen.find((s) => s.phase === "streaming");
      expect(streamingCommit).toMatchObject({ text: "Hello world" });
      expect(seen.at(-1)).toMatchObject({ phase: "completed", messageId: MSG });

      unsub();
    } finally {
      restore();
    }
  });
});
