// domain/chat/substrate/abort-cause — the typed cause on a turn registration's signal when the process, not a
// member, ends the turn. An abort that `activeTurns` fires with no cause is a member's Stop (or the room-gone
// sweep); the registry's shutdown dispose stamps {@link ShutdownAbort}. The cause is read off `signal.reason`,
// never off an error's name (the engine's `abortReasonFor` law). The provider layer flattens the reason, so
// this class never reaches a transport classifier.

import type { TurnAbortReason } from "@orb/contracts/chat";

/** Why the registry's dispose aborted an in-flight turn: the server is closing, so no member asked for the turn to end. */
export class ShutdownAbort extends Error {
  constructor() {
    super("the server is shutting down");
    this.name = "ShutdownAbort";
  }
}

/** The reason a signal aborted by the active-turns registry settles under: `shutdown` for the dispose, `user` for
 *  every other registry abort (a member's Stop, the host's room-gone sweep). */
export function registryAbortReason(signal: AbortSignal): Extract<TurnAbortReason, "user" | "shutdown"> {
  return signal.reason instanceof ShutdownAbort ? "shutdown" : "user";
}

// A mapped Record, so a new abort reason fails `tsc` until it says whether it settles an owed reply.
const SETTLES_OWED_REPLY: Readonly<Record<TurnAbortReason, boolean>> = { user: true, error: false, stale: false, shutdown: false };

/** Whether an abort that kept no text settles the owed reply it cut (D332). Only a member's Stop does: the
 *  member does not want that reply. A fault, a lost lock or a shutdown is not their call, so the reply stays owed. */
export function abortSettlesOwedReply(reason: TurnAbortReason): boolean {
  return SETTLES_OWED_REPLY[reason];
}

// A mapped Record, so a new abort reason fails `tsc` until it says whether text already streamed is kept.
const KEEPS_STREAMED_TEXT: Readonly<Record<TurnAbortReason, boolean>> = { user: true, error: false, stale: false, shutdown: true };

/** Whether an abort commits the text that had already streamed as the reply. A Stop and a shutdown do: once the
 *  text is there it stays. A fault or a lost lock never does, since the canon write is not safe or not wanted. */
export function abortKeepsStreamedText(reason: TurnAbortReason): boolean {
  return KEEPS_STREAMED_TEXT[reason];
}
