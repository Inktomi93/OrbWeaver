// The stream/turn lifecycle store: holds the ghost turn per chat as a discriminated-union state
// machine. Transitions are strict `set(next, true)` replace — a dropped field is a typecheck error.
// Token churn stays isolated: only a component subscribed to that chat's slot re-renders on a delta.
//
// Write ownership: every action here is bus-only (called only from `applyChatBusEvent`) except
// `markStopping`, which the composer's Stop button calls directly for instant feedback before the
// abort round-trip starts. The slot does not close there — it closes only on the bus's turnAborted
// (or a race-won turnCompleted).

import type { ChatDeltaEvent, TurnAbortReason, TurnIntent } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { perfMark, perfMeasure } from "#lib";
import { createGatedStore } from "./create-gated-store";

// Mark names are per-chat so concurrent rooms never cross-measure: beginTurn stamps the start, the
// first delta onto a pending slot measures TTFT, and the terminal events measure end-to-end latency.
const turnStartMark = (chatId: ChatId): string => `turn-begin:${chatId}`;
const ttftMeasure = (chatId: ChatId): string => `turn-ttft:${chatId}`;
const turnLatencyMeasure = (chatId: ChatId): string => `turn-latency:${chatId}`;

/** The per-chat turn slot — one phase at a time, fields per phase (never optional-field soup). */
export type TurnSlot =
  | { readonly phase: "idle" }
  | {
      readonly phase: "pending"; // turnStarted seen, no token yet — the TTFT "Thinking…" window
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
    }
  | {
      readonly phase: "streaming";
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
      readonly text: string;
      readonly reasoning: string;
    }
  | {
      // The server may still emit deltas until it observes the cancel, so this carries the same
      // accumulated fields as streaming. Terminal only on turnCompleted/turnAborted.
      readonly phase: "stopping";
      readonly intent: TurnIntent;
      readonly speakerCharacterId: CharacterId | null;
      readonly targetMessageId: MessageId | null;
      readonly text: string;
      readonly reasoning: string;
    }
  | {
      readonly phase: "completed";
      readonly intent: TurnIntent;
      readonly messageId: MessageId | null;
    }
  | { readonly phase: "aborted"; readonly intent: TurnIntent; readonly reason: TurnAbortReason };

interface ChatStreamState {
  readonly turns: Readonly<Record<string, TurnSlot>>;
}

/** The stable "no turn" slot — frozen so selectors returning it never mint a fresh object per render. */
const IDLE_TURN: TurnSlot = Object.freeze({ phase: "idle" as const });

const useChatStreamStore = createGatedStore<ChatStreamState>(
  "chat-stream",
  (): ChatStreamState => ({ turns: {} }),
);

function slotOf(chatId: ChatId): TurnSlot {
  return useChatStreamStore.getState().turns[chatId] ?? IDLE_TURN;
}

function setSlot(chatId: ChatId, next: TurnSlot, action: string): void {
  const turns = { ...useChatStreamStore.getState().turns, [chatId]: next };
  useChatStreamStore.setState({ turns }, true, action);
}

/** The write API — every action but `markStopping` is consumed only by `applyChatBusEvent`. */
export interface ChatStreamApi {
  readonly beginTurn: (
    chatId: ChatId,
    turn: {
      intent: TurnIntent;
      speakerCharacterId: CharacterId | null;
      targetMessageId: MessageId | null;
    },
  ) => void;
  readonly appendDelta: (delta: ChatDeltaEvent) => void;
  readonly completeTurn: (chatId: ChatId, messageId: MessageId | null) => void;
  readonly abortTurn: (chatId: ChatId, reason: TurnAbortReason) => void;
  /** Fire the per-chat "the caller's own user row committed" signal — a fire-and-forget notification,
   *  not a slot write. The composer's send-hook subscribes to clear its draft exactly on this. */
  readonly notifyUserMessageCommitted: (chatId: ChatId) => void;
  /** Component-callable: pending/streaming → stopping, preserving accumulated text/reasoning.
   *  Idempotent no-op from any other phase. */
  readonly markStopping: (chatId: ChatId) => void;
}

// Fire-and-forget notification, not state anyone reads back — homing it as store state would only
// invite a stray selector and a fresh render on every send.
const userMessageCommittedListeners = new Map<ChatId, Set<() => void>>();

/** Subscribe to "a user-role messageCommitted for `chatId` was observed" (fired once per such event).
 *  Returns an unsubscribe the caller must invoke. */
export function subscribeUserMessageCommitted(chatId: ChatId, listener: () => void): () => void {
  const set = userMessageCommittedListeners.get(chatId) ?? new Set<() => void>();
  set.add(listener);
  userMessageCommittedListeners.set(chatId, set);
  return (): void => {
    const current = userMessageCommittedListeners.get(chatId);
    if (current === undefined) {
      return;
    }
    current.delete(listener);
    if (current.size === 0) {
      userMessageCommittedListeners.delete(chatId);
    }
  };
}

export const chatStream: ChatStreamApi = {
  beginTurn: (chatId, turn) => {
    perfMark(turnStartMark(chatId));
    setSlot(chatId, { phase: "pending", ...turn }, "turn/begin");
  },
  appendDelta: (delta) => {
    const slot = slotOf(delta.chatId);
    // A delta with no live turn (raced past a terminal event) is dropped — invalidation already
    // refetched the durable canon.
    if (slot.phase === "pending") {
      perfMeasure(ttftMeasure(delta.chatId), turnStartMark(delta.chatId));
      setSlot(
        delta.chatId,
        {
          phase: "streaming",
          intent: slot.intent,
          speakerCharacterId: slot.speakerCharacterId,
          targetMessageId: slot.targetMessageId,
          text: delta.kind === "text" ? delta.text : "",
          reasoning: delta.kind === "reasoning" ? delta.text : "",
        },
        "turn/delta",
      );
      return;
    }
    if (slot.phase === "streaming" || slot.phase === "stopping") {
      setSlot(
        delta.chatId,
        {
          ...slot,
          text: delta.kind === "text" ? slot.text + delta.text : slot.text,
          reasoning: delta.kind === "reasoning" ? slot.reasoning + delta.text : slot.reasoning,
        },
        "turn/delta",
      );
    }
  },
  completeTurn: (chatId, messageId) => {
    const slot = slotOf(chatId);
    if (slot.phase === "pending" || slot.phase === "streaming" || slot.phase === "stopping") {
      perfMeasure(turnLatencyMeasure(chatId), turnStartMark(chatId));
      setSlot(chatId, { phase: "completed", intent: slot.intent, messageId }, "turn/complete");
    }
  },
  abortTurn: (chatId, reason) => {
    const slot = slotOf(chatId);
    if (slot.phase === "pending" || slot.phase === "streaming" || slot.phase === "stopping") {
      perfMeasure(turnLatencyMeasure(chatId), turnStartMark(chatId));
      setSlot(chatId, { phase: "aborted", intent: slot.intent, reason }, "turn/abort");
    }
  },
  notifyUserMessageCommitted: (chatId) => {
    const set = userMessageCommittedListeners.get(chatId);
    if (set === undefined) {
      return;
    }
    // Snapshot before firing — an unsubscribe inside a listener must not mutate the set mid-iteration.
    for (const listener of [...set]) {
      listener();
    }
  },
  markStopping: (chatId) => {
    const slot = slotOf(chatId);
    if (slot.phase === "pending") {
      setSlot(
        chatId,
        {
          phase: "stopping",
          intent: slot.intent,
          speakerCharacterId: slot.speakerCharacterId,
          targetMessageId: slot.targetMessageId,
          text: "",
          reasoning: "",
        },
        "turn/stopping",
      );
      return;
    }
    if (slot.phase === "streaming") {
      setSlot(chatId, { ...slot, phase: "stopping" }, "turn/stopping");
    }
    // idle / stopping / completed / aborted: idempotent no-op (the double-abort guard).
  },
};

/** The narrow read hook — a component re-renders only when ITS chat's slot changes. */
export function useTurnSlot(chatId: ChatId | null): TurnSlot {
  return useChatStreamStore((s) => (chatId === null ? IDLE_TURN : (s.turns[chatId] ?? IDLE_TURN)));
}

/** Phase-only read for chrome (Stop button, spinner) — token churn never reaches subscribers. */
export function useTurnPhase(chatId: ChatId | null): TurnSlot["phase"] {
  return useChatStreamStore((s) =>
    chatId === null ? "idle" : (s.turns[chatId] ?? IDLE_TURN).phase,
  );
}

/** The live turn's voiced speaker — stable across every token delta (only text/reasoning change per
 *  delta), so this never re-renders on a delta. `null` off-turn or for a narrator/persona-less turn. */
export function useTurnSpeakerCharacterId(chatId: ChatId | null): CharacterId | null {
  return useChatStreamStore((s) => {
    if (chatId === null) {
      return null;
    }
    const slot = s.turns[chatId] ?? IDLE_TURN;
    return slot.phase === "pending" || slot.phase === "streaming" || slot.phase === "stopping"
      ? slot.speakerCharacterId
      : null;
  });
}

/** True for pending/streaming/stopping — the render side must agree stopping is still live, or the
 *  ghost row unmounts the instant Stop is clicked. */
export function isLiveTurnPhase(phase: TurnSlot["phase"]): boolean {
  return phase === "pending" || phase === "streaming" || phase === "stopping";
}

/** Transient (render-free) subscription to one chat's slot — the smooth-text pacer's feed. */
export function subscribeTurnSlot(chatId: ChatId, listener: (slot: TurnSlot) => void): () => void {
  return useChatStreamStore.subscribe((s) => s.turns[chatId] ?? IDLE_TURN, listener);
}
