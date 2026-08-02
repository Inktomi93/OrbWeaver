// The stream/turn lifecycle store: holds the ghost turn per chat as a discriminated-union state
// machine. Transitions are strict `set(next, true)` replace — a dropped field is a typecheck error.
// Token churn stays isolated: only a component subscribed to that chat's slot re-renders on a delta.
//
// Write ownership: every action here is bus-only (called only from `applyChatBusEvent`) except
// `markStopping`, which the composer's Stop button reaches via `data/bus`'s `markTurnStopping`
// wrapper for instant feedback before the abort round-trip starts (`chatStream` itself may only be
// imported inside data/bus/ — gate `chat-stream-writes-in-bus-only`). The slot does not close there —
// it closes only on the bus's turnAborted (or a race-won turnCompleted).

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

const useChatStreamStore = createGatedStore<ChatStreamState>("chat-stream", (): ChatStreamState => ({ turns: {} }));

function slotOf(chatId: ChatId): TurnSlot {
  return useChatStreamStore.getState().turns[chatId] ?? IDLE_TURN;
}

function setSlot(chatId: ChatId, next: TurnSlot, action: string): void {
  const turns = { ...useChatStreamStore.getState().turns, [chatId]: next };
  useChatStreamStore.setState({ turns }, true, action);
}

// ── rAF-batched token accumulation (task #20) ──────────────────────────────────────────────────────
// A streaming turn emits many small `delta` chunks; committing each one straight to the store re-rendered
// the ghost row per chunk (side-eye: 181 commits / ~50 "nested-update" warnings for ONE short turn). Fix:
// buffer the chunks per chat and flush the ACCUMULATED text to the store once per animation frame, so the
// ghost commits at frame cadence, not per token. The buffer is append-in-arrival-order, so the flushed
// text is byte-identical to the per-chunk path — only the commit CADENCE changes, never the bytes/order.
//
// Terminals (complete/abort) and `markStopping` flush the pending buffer for that chat SYNCHRONOUSLY first
// (so no trailing token is dropped and the phase transition lands AFTER the text it followed). In a
// non-browser env (vitest/node — no `requestAnimationFrame`) the scheduler runs the flush SYNCHRONOUSLY,
// preserving the store's existing synchronous per-delta contract the unit/CT suites assert against.

interface PendingTokens {
  text: string;
  reasoning: string;
}

const pendingTokensByChat = new Map<ChatId, PendingTokens>();
const scheduledChats = new Set<ChatId>();
let flushScheduled = false;

/** Schedule the next batch flush. Defaults to one `requestAnimationFrame` in the browser (frame-cadence
 *  commits) and to a SYNCHRONOUS run off-browser (vitest/node — no rAF), which preserves the store's
 *  synchronous per-delta contract the unit/CT suites assert. `__setFrameSchedulerForTest` swaps it for a manual
 *  driver in a test so batch coalescing (N deltas → 1 commit) is deterministically assertable. */
type FrameScheduler = (flush: () => void) => void;
// Read rAF off globalThis via a local all-optional shape (the OrbBusHandle posture): this file rides in
// DOM-less programs too (the node test graph imports it), where a bare `requestAnimationFrame` reference
// does not compile. The runtime value is the real browser rAF when present, undefined under vitest/node.
const maybeRaf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
const defaultScheduler: FrameScheduler =
  maybeRaf !== undefined
    ? (flush): void => {
        maybeRaf(flush);
      }
    : (flush): void => flush();
let frameScheduler: FrameScheduler = defaultScheduler;

/** Test seam: install a manual frame scheduler (returns a restore fn). Buffered deltas then flush only when
 *  the captured callback is invoked, so a test can deliver a burst and assert it coalesced to one commit. */
export function __setFrameSchedulerForTest(scheduler: FrameScheduler): () => void {
  const previous = frameScheduler;
  frameScheduler = scheduler;
  return (): void => {
    frameScheduler = previous;
  };
}

/** Flush one chat's buffered tokens into its slot (pending→streaming or streaming/stopping append). No-op
 *  if nothing is buffered or the slot is no longer live (a terminal raced in). */
function flushChat(chatId: ChatId): void {
  const pending = pendingTokensByChat.get(chatId);
  if (pending === undefined) {
    return;
  }
  pendingTokensByChat.delete(chatId);
  scheduledChats.delete(chatId);
  const slot = slotOf(chatId);
  if (slot.phase === "pending") {
    setSlot(
      chatId,
      {
        phase: "streaming",
        intent: slot.intent,
        speakerCharacterId: slot.speakerCharacterId,
        targetMessageId: slot.targetMessageId,
        text: pending.text,
        reasoning: pending.reasoning,
      },
      "turn/delta",
    );
    return;
  }
  if (slot.phase === "streaming" || slot.phase === "stopping") {
    setSlot(chatId, { ...slot, text: slot.text + pending.text, reasoning: slot.reasoning + pending.reasoning }, "turn/delta");
  }
  // idle/completed/aborted: a terminal raced past — drop the buffered tail (the durable canon stands).
}

function flushAll(): void {
  flushScheduled = false;
  for (const chatId of [...scheduledChats]) {
    flushChat(chatId);
  }
}

/** Buffer a chunk and ensure a flush is scheduled (ONE frame for all chats coalesces a token burst; the
 *  default off-browser scheduler runs it synchronously, preserving the per-delta contract). */
function scheduleDelta(chatId: ChatId, textPart: string, reasoningPart: string): void {
  const pending = pendingTokensByChat.get(chatId) ?? { text: "", reasoning: "" };
  pending.text += textPart;
  pending.reasoning += reasoningPart;
  pendingTokensByChat.set(chatId, pending);
  scheduledChats.add(chatId);
  if (!flushScheduled) {
    flushScheduled = true;
    frameScheduler(flushAll);
  }
}

/** Drain any buffered tokens for `chatId` NOW — called before a terminal/stopping transition so the last
 *  streamed tokens land before the phase change (never dropped, never reordered after the terminal). */
function flushPending(chatId: ChatId): void {
  if (scheduledChats.has(chatId)) {
    flushChat(chatId);
  }
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
  /** Called via `data/bus`'s `markTurnStopping` wrapper: pending/streaming → stopping, preserving
   *  accumulated text/reasoning. Idempotent no-op from any other phase. */
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
    // Discard any un-flushed buffer from a prior turn on this chat so a rapid begin never inherits stale
    // tokens (a terminal normally drains it first; this closes the begin-races-an-unflushed-frame edge).
    pendingTokensByChat.delete(chatId);
    scheduledChats.delete(chatId);
    perfMark(turnStartMark(chatId));
    setSlot(chatId, { phase: "pending", ...turn }, "turn/begin");
  },
  appendDelta: (delta) => {
    const slot = slotOf(delta.chatId);
    // A delta with no live turn (raced past a terminal event) is dropped — invalidation already
    // refetched the durable canon. TTFT is measured at the FIRST token's ARRIVAL (not the batched flush)
    // so the metric stays honest; the token itself rides the rAF-batched buffer (scheduleDelta).
    if (slot.phase === "pending" && !scheduledChats.has(delta.chatId)) {
      perfMeasure(ttftMeasure(delta.chatId), turnStartMark(delta.chatId));
    }
    if (slot.phase === "pending" || slot.phase === "streaming" || slot.phase === "stopping") {
      scheduleDelta(delta.chatId, delta.kind === "text" ? delta.text : "", delta.kind === "reasoning" ? delta.text : "");
    }
  },
  completeTurn: (chatId, messageId) => {
    flushPending(chatId); // land any buffered tail tokens BEFORE the terminal so none are dropped.
    const slot = slotOf(chatId);
    if (slot.phase === "pending" || slot.phase === "streaming" || slot.phase === "stopping") {
      perfMeasure(turnLatencyMeasure(chatId), turnStartMark(chatId));
      setSlot(chatId, { phase: "completed", intent: slot.intent, messageId }, "turn/complete");
    }
  },
  abortTurn: (chatId, reason) => {
    flushPending(chatId); // land any buffered tail tokens BEFORE the terminal.
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
    flushPending(chatId); // land buffered tokens first so a stop never blanks accumulated text.
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
  return useChatStreamStore((s) => (chatId === null ? "idle" : (s.turns[chatId] ?? IDLE_TURN).phase));
}

/** The live turn's voiced speaker — stable across every token delta (only text/reasoning change per
 *  delta), so this never re-renders on a delta. `null` off-turn or for a narrator/persona-less turn. */
export function useTurnSpeakerCharacterId(chatId: ChatId | null): CharacterId | null {
  return useChatStreamStore((s) => {
    if (chatId === null) {
      return null;
    }
    const slot = s.turns[chatId] ?? IDLE_TURN;
    return slot.phase === "pending" || slot.phase === "streaming" || slot.phase === "stopping" ? slot.speakerCharacterId : null;
  });
}

/** The message id a live SWIPE turn rerolls IN PLACE — the reroll's ghost occupies THIS committed row's
 *  slot (one row throughout, live nav) instead of appending a second row beside the old variant. Only a
 *  `swipe` intent replaces-in-place: `continue` also carries a `targetMessageId` but legitimately extends
 *  its target with a ghost APPENDED after it (the old text stays visible), and send/generate/impersonate
 *  carry none. Stable across every token delta (only text/reasoning change), so reading it never
 *  re-renders the list on a token. `null` off-turn, for a non-swipe intent, or a swipe with no target. */
export function useSwipeTargetMessageId(chatId: ChatId | null): MessageId | null {
  return useChatStreamStore((s) => {
    if (chatId === null) {
      return null;
    }
    const slot = s.turns[chatId] ?? IDLE_TURN;
    if (slot.phase !== "pending" && slot.phase !== "streaming" && slot.phase !== "stopping") {
      return null;
    }
    return slot.intent === "swipe" ? slot.targetMessageId : null;
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
