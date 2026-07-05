// The stream/turn lifecycle store (UI-Arch §5): the SANCTIONED local transient buffer the bus→cache
// seam is allowed (§11.1 — "onData may buffer transient progress in LOCAL state"), holding the ghost
// turn per chat as a discriminated-union state machine. Slot lifecycle is owned by the TERMINAL turn
// events (Stop stays live across the whole turn incl. TTFT); transitions are `set(next, true)`
// REPLACE (Zustand v5 strict replace — a dropped field is a typecheck error, no stale field can
// bleed across phases, UI-Lib-Zustand.md D-5). Token churn stays isolated: only a component
// subscribed to THAT chat's slot re-renders on a delta — chrome subscribes to phase.
// `subscribeWithSelector` exposes the transient (render-free) seam the smooth-text pacer feeds from
// (baked into `createGatedStore`, which also owns the devtools middleware + the REQUIRED
// action-label discipline — every transition below is named on the DU timeline).
//
// WRITE OWNERSHIP: every action here is bus-only (called ONLY from `applyChatBusEvent`, data/bus) —
// EXCEPT `markStopping`, the ONE action a component may call directly. The composer's Stop button
// calls it FIRST, before the abort round-trip even starts, so the UI reflects "stopping" the instant
// the user clicks (immediate feedback) and a second click is a no-op (the phase guard below makes
// double-abort impossible at the store level, belt-and-suspenders under the composer's own guard).
// The slot does NOT close here — `stopping` is not a terminal phase; it closes only when the bus
// delivers the server's `turnAborted` (or a race-won `turnCompleted`), same as every other phase.

import type { ChatDeltaEvent, TurnAbortReason, TurnIntent } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

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
      // The user hit Stop — `markStopping` fired BEFORE the abort round-trip so feedback is instant;
      // the server's turn may still legitimately emit deltas until it observes the cancellation, so
      // this carries the SAME accumulated text/reasoning fields as `streaming` (appendDelta keeps
      // writing into them) — only the phase differs. Terminal ONLY on turnCompleted/turnAborted.
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

/** The stable "no turn" slot — a frozen module constant so selectors returning it never mint a
 *  fresh object per render (the v5 `Object.is` infinite-loop footgun, UI-Lib-Zustand.md C-1). */
export const IDLE_TURN: TurnSlot = Object.freeze({ phase: "idle" as const });

const useChatStreamStore = createGatedStore<ChatStreamState>(
  "chat-stream",
  (): ChatStreamState => ({ turns: {} }),
);

function slotOf(chatId: ChatId): TurnSlot {
  return useChatStreamStore.getState().turns[chatId] ?? IDLE_TURN;
}

function setSlot(chatId: ChatId, next: TurnSlot | undefined, action: string): void {
  const turns = { ...useChatStreamStore.getState().turns };
  if (next === undefined) {
    delete turns[chatId];
  } else {
    turns[chatId] = next;
  }
  useChatStreamStore.setState({ turns }, true, action);
}

/** The write API — every action but `markStopping` is consumed ONLY by `applyChatBusEvent` (data/bus);
 *  see the header WRITE OWNERSHIP note for the one sanctioned component-callable exception. */
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
  /** Component-callable (see header WRITE OWNERSHIP note): `pending`/`streaming` → `stopping`,
   *  preserving whatever text/reasoning had already accumulated. Idempotent no-op from any other
   *  phase (already stopping / idle / terminal) — the store-level half of the double-abort guard. */
  readonly markStopping: (chatId: ChatId) => void;
}

export const chatStream: ChatStreamApi = {
  beginTurn: (chatId, turn) => {
    setSlot(chatId, { phase: "pending", ...turn }, "turn/begin");
  },
  appendDelta: (delta) => {
    const slot = slotOf(delta.chatId);
    // A delta with no live turn (raced past a terminal event / replay edge) is dropped — the durable
    // canon is the truth and the invalidation path already refetched it.
    if (slot.phase === "pending") {
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
    // A delta legitimately keeps arriving mid-stop (the server hasn't observed the cancel yet) — it
    // accumulates the same way `streaming` does, without leaving `stopping`.
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
      setSlot(chatId, { phase: "completed", intent: slot.intent, messageId }, "turn/complete");
    }
  },
  abortTurn: (chatId, reason) => {
    const slot = slotOf(chatId);
    if (slot.phase === "pending" || slot.phase === "streaming" || slot.phase === "stopping") {
      setSlot(chatId, { phase: "aborted", intent: slot.intent, reason }, "turn/abort");
    }
  },
  clearTurn: (chatId) => {
    setSlot(chatId, undefined, "turn/clear");
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

/** True for `pending`/`streaming`/`stopping` — the store's own "a turn is live" definition (mirrors
 *  `appendDelta`'s accumulate-through-stopping invariant above): the render side must agree that
 *  `stopping` is still live, or the ghost row unmounts/blanks the instant Stop is clicked. */
export function isLiveTurnPhase(phase: TurnSlot["phase"]): boolean {
  return phase === "pending" || phase === "streaming" || phase === "stopping";
}

/** Non-reactive one-shot phase read for imperative callbacks that can't call the `useTurnPhase` hook
 *  (e.g. `use-send-message`'s post-failure restore gate, which reads — at catch time — whether the
 *  turn already left `idle`, i.e. whether `messageCommitted`/`turnStarted` have been observed). */
export function readTurnPhase(chatId: ChatId | null): TurnSlot["phase"] {
  return chatId === null
    ? "idle"
    : (useChatStreamStore.getState().turns[chatId] ?? IDLE_TURN).phase;
}

/** Transient (render-free) subscription to one chat's slot — the smooth-text pacer's feed
 *  (UI-Lib-Zustand.md D-6: high-frequency token appends bypass React renders entirely). */
export function subscribeTurnSlot(chatId: ChatId, listener: (slot: TurnSlot) => void): () => void {
  return useChatStreamStore.subscribe((s) => s.turns[chatId] ?? IDLE_TURN, listener);
}
