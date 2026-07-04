// The stream/turn lifecycle store (UI-Arch §5): the SANCTIONED local transient buffer the bus→cache
// seam is allowed (§11.1 — "onData may buffer transient progress in LOCAL state"), holding the ghost
// turn per chat as a discriminated-union state machine. Slot lifecycle is owned by the TERMINAL turn
// events (Stop stays live across the whole turn incl. TTFT); transitions are `set(next, true)`
// REPLACE (Zustand v5 strict replace — a dropped field is a typecheck error, no stale field can
// bleed across phases, UI-Lib-Zustand.md D-5). Writes come ONLY from `applyChatBusEvent` (the one
// cache-surgery site); components read via the narrow hooks below. Token churn stays isolated: only
// a component subscribed to THAT chat's slot re-renders on a delta — chrome subscribes to phase.
// `subscribeWithSelector` exposes the transient (render-free) seam the smooth-text pacer feeds from.

import type { ChatDeltaEvent, TurnAbortReason, TurnIntent } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

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
      readonly phase: "completed";
      readonly intent: TurnIntent;
      readonly messageId: MessageId | null;
    }
  | { readonly phase: "aborted"; readonly intent: TurnIntent; readonly reason: TurnAbortReason };

interface ChatStreamState {
  readonly turns: Readonly<Record<string, TurnSlot>>;
}

/** The stable "no turn" slot — a frozen module constant so selectors returning it never mint a
 *  fresh object per render (the v5 `Object.is` infinite-loop footgun, UI-Lib-Zustand.md C-1). */
export const IDLE_TURN: TurnSlot = Object.freeze({ phase: "idle" as const });

const useChatStreamStore = create<ChatStreamState>()(
  subscribeWithSelector((): ChatStreamState => ({ turns: {} })),
);

function slotOf(chatId: ChatId): TurnSlot {
  return useChatStreamStore.getState().turns[chatId] ?? IDLE_TURN;
}

function setSlot(chatId: ChatId, next: TurnSlot | undefined): void {
  const turns = { ...useChatStreamStore.getState().turns };
  if (next === undefined) {
    delete turns[chatId];
  } else {
    turns[chatId] = next;
  }
  useChatStreamStore.setState({ turns }, true);
}

/** The write API — consumed ONLY by `applyChatBusEvent` (data/bus); never call from a component. */
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
  readonly clearTurn: (chatId: ChatId) => void;
}

export const chatStream: ChatStreamApi = {
  beginTurn: (chatId, turn) => {
    setSlot(chatId, { phase: "pending", ...turn });
  },
  appendDelta: (delta) => {
    const slot = slotOf(delta.chatId);
    // A delta with no live turn (raced past a terminal event / replay edge) is dropped — the durable
    // canon is the truth and the invalidation path already refetched it.
    if (slot.phase === "pending") {
      setSlot(delta.chatId, {
        phase: "streaming",
        intent: slot.intent,
        speakerCharacterId: slot.speakerCharacterId,
        targetMessageId: slot.targetMessageId,
        text: delta.kind === "text" ? delta.text : "",
        reasoning: delta.kind === "reasoning" ? delta.text : "",
      });
      return;
    }
    if (slot.phase === "streaming") {
      setSlot(delta.chatId, {
        ...slot,
        text: delta.kind === "text" ? slot.text + delta.text : slot.text,
        reasoning: delta.kind === "reasoning" ? slot.reasoning + delta.text : slot.reasoning,
      });
    }
  },
  completeTurn: (chatId, messageId) => {
    const slot = slotOf(chatId);
    if (slot.phase === "pending" || slot.phase === "streaming") {
      setSlot(chatId, { phase: "completed", intent: slot.intent, messageId });
    }
  },
  abortTurn: (chatId, reason) => {
    const slot = slotOf(chatId);
    if (slot.phase === "pending" || slot.phase === "streaming") {
      setSlot(chatId, { phase: "aborted", intent: slot.intent, reason });
    }
  },
  clearTurn: (chatId) => {
    setSlot(chatId, undefined);
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

/** Transient (render-free) subscription to one chat's slot — the smooth-text pacer's feed
 *  (UI-Lib-Zustand.md D-6: high-frequency token appends bypass React renders entirely). */
export function subscribeTurnSlot(chatId: ChatId, listener: (slot: TurnSlot) => void): () => void {
  return useChatStreamStore.subscribe((s) => s.turns[chatId] ?? IDLE_TURN, listener);
}
