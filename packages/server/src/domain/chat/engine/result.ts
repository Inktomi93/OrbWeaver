// domain/chat/engine/result — the pure `TurnOutcome` builders.
// One home for the two shapes the engine lifecycle returns: a COMMITTED outcome (the committed message rows
// joined to their selected variant — D26) and an ABORTED outcome (the lifecycle refusal + reason). Pure: no
// db, no clock — the engine builds canon/economics, these just shape the return.

import type { MessageView, TurnAbortReason } from "@orb/contracts/chat";
import type { TurnOutcome } from "../contract/results.ts";

/** A completed turn — the committed message(s) (≥1; a per-speaker round emits one per speaker — the
 *  arbitration chunk passes several, the single-speaker core exactly one). */
export function committedOutcome(messages: readonly MessageView[]): TurnOutcome {
  return { messages, aborted: false, abortReason: undefined };
}

/** A turn that ended before any commit — the lifecycle refusal + why (`TURN_ABORT_REASONS`). */
export function abortedOutcome(reason: TurnAbortReason): TurnOutcome {
  return { messages: [], aborted: true, abortReason: reason };
}
