// What has failed in a paged history, and what is owed for it. The query cannot hold this: its direction flags restate on
// every fetch, so one read's failure overwrites another's, and a landed read clears an error it did not repeat.

import type { ChatId } from "@orb/kit/ids";
import type { CHAT_HISTORY_FAILURE_COPY } from "./chat-surface-names.ts";

/** A read of the history, and the failure of that read. */
export type HistoryFailure = keyof typeof CHAT_HISTORY_FAILURE_COPY;

// A read that can be in flight. Offline is the absence of one: the query pauses and nothing rejects.
type HistoryRead = Exclude<HistoryFailure, "offline">;

/** One render's view of the query. A fetch that was cancelled moves neither `errors` nor `landedAt`. */
export interface HistoryFetchView {
  readonly chatId: ChatId;
  readonly read: HistoryRead | null;
  /** The query holds a read until the connection returns. */
  readonly paused: boolean;
  readonly errors: number;
  readonly landedAt: number;
  /** The loaded pages stop short of the live tail and a forward read exists. */
  readonly canBridge: boolean;
}

interface Flight {
  readonly read: HistoryRead;
  readonly errors: number;
  readonly landedAt: number;
}

export interface HistoryFailures {
  readonly chatId: ChatId;
  readonly flight: Flight | null;
  readonly press: boolean;
  /** The reader asked for a read and the connection is holding it. */
  readonly offline: boolean;
  /** What the reader asked for and has not seen answered holds their view until dismissed or resolved. */
  readonly pinned: boolean;
  readonly bridge: boolean;
  readonly refresh: boolean;
  /** A read landed, so the server is back: a failed bridge may try once more. */
  readonly bridgeDue: boolean;
  /** A read landed while a failed refresh stands: the refresh is owed. */
  readonly refreshDue: boolean;
  /** The reader asked for the read in hand, so its failure speaks even when the line is unchanged. */
  readonly asked: boolean;
  /** Rises each time a failure must speak. */
  readonly announcement: number;
  /** A failure has shown in this room, so the pager stays: focus needs somewhere to go when the failure leaves. */
  readonly reported: boolean;
}

export function noHistoryFailures(chatId: ChatId): HistoryFailures {
  return {
    chatId,
    flight: null,
    press: false,
    offline: false,
    pinned: false,
    bridge: false,
    refresh: false,
    bridgeDue: false,
    refreshDue: false,
    asked: false,
    announcement: 0,
    reported: false,
  };
}

function failed(state: HistoryFailures, read: HistoryRead): HistoryFailures {
  const spoken = { ...state, flight: null, asked: false, reported: true, announcement: state.announcement + (state.asked || read === "press" ? 1 : 0) };
  if (read === "press") {
    return { ...spoken, press: true, pinned: true };
  }
  return read === "bridge" ? { ...spoken, bridge: true, bridgeDue: false } : { ...spoken, refresh: true };
}

function landed(state: HistoryFailures, read: HistoryRead): HistoryFailures {
  const cleared = {
    ...state,
    flight: null,
    press: read === "press" ? false : state.press,
    pinned: read === "press" ? false : state.pinned,
    bridge: read === "bridge" ? false : state.bridge,
    refresh: read === "refresh" ? false : state.refresh,
  };
  const bridgeDue = cleared.bridge;
  const refreshDue = cleared.refresh;
  return { ...cleared, bridgeDue, refreshDue, asked: state.asked && (bridgeDue || refreshDue) };
}

function started(state: HistoryFailures, view: HistoryFetchView, read: HistoryRead): HistoryFailures {
  if (state.flight?.read === read) {
    return state;
  }
  return {
    ...state,
    // A read that takes over from a cancelled one keeps its baseline, so the outcome is measured across the whole flight.
    flight: { read, errors: state.flight?.errors ?? view.errors, landedAt: state.flight?.landedAt ?? view.landedAt },
    bridgeDue: read === "bridge" ? false : state.bridgeDue,
    refreshDue: read === "refresh" ? false : state.refreshDue,
  };
}

function settled(state: HistoryFailures, view: HistoryFetchView, flight: Flight): HistoryFailures {
  if (view.errors !== flight.errors) {
    return failed(state, flight.read);
  }
  return view.landedAt === flight.landedAt ? { ...state, flight: null } : landed(state, flight.read);
}

function connection(state: HistoryFailures, paused: boolean): HistoryFailures {
  if (paused) {
    return state.asked && !state.offline ? { ...state, offline: true, pinned: true, reported: true, announcement: state.announcement + 1 } : state;
  }
  return state.offline ? { ...state, offline: false, pinned: state.press } : state;
}

/**
 * The reader closed what they asked for: the line leaves, and a failure behind it, if one stands, shows instead. A held
 * read is not cancelled, so the connection's return still loads it; the next failure to speak is a new one.
 */
export function dismissHistoryFailure(state: HistoryFailures): HistoryFailures {
  return { ...state, press: false, offline: false, pinned: false, asked: false };
}

/** The reader pressed for older rows. A press the connection is already holding is heard again, in the same words. */
export function pressAsked(state: HistoryFailures): HistoryFailures {
  return { ...state, asked: true, announcement: state.offline ? state.announcement + 1 : state.announcement };
}

/** A press ended in neither a page nor the end of history: nothing rejected, so no failure reached the query's view. */
export function pressLost(state: HistoryFailures, chatId: ChatId): HistoryFailures {
  return state.chatId !== chatId || state.press ? state : failed(state, "press");
}

/** The state after one render's view; the same object when nothing changed. */
export function observeHistoryFetch(previous: HistoryFailures, view: HistoryFetchView): HistoryFailures {
  if (previous.chatId !== view.chatId) {
    return noHistoryFailures(view.chatId);
  }
  const state = connection(previous, view.paused);
  if (view.read !== null) {
    return started(state, view, view.read);
  }
  if (state.flight !== null) {
    return settled(state, view, state.flight);
  }
  return state.bridge && !view.canBridge ? { ...state, bridge: false, bridgeDue: false } : state;
}

/** The one failure the pager shows: the reader's own first, then what the transcript is missing. */
export function shownHistoryFailure(state: HistoryFailures): HistoryFailure | null {
  if (state.offline) {
    return "offline";
  }
  if (state.press) {
    return "press";
  }
  if (state.bridge) {
    return "bridge";
  }
  return state.refresh ? "refresh" : null;
}
