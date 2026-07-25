// The turn-abort notification mapper — the ONE testable home for two coupled decisions the stale-lock
// honesty fix needs (owner-approved enhancement). Both are pure; the CT QueryClient has no MutationCache
// seam so toast copy is unobservable in a CT — this mapper is unit-tested instead (the ct-queryclient
// precedent), and the bus reducer + the turn-mutation hooks stay one-liners over it.
//
// WHY two functions, one home:
//   • `turnAbortNotice(reason)` — the bus-side surface. `applyChatBusEvent` sees EVERY turnAborted (SSE),
//     including detached auto-mode turns no awaiting caller sees, so the bus is the one place a stale abort
//     is always observable. `stale` → the honest notice; `user` (deliberate cancel) → nothing; `error` →
//     nothing HERE — a real fault ALSO throws out the awaited verb and rides the tRPC error boundary
//     (query-client `meta.errorToast`), so notifying on the bus too would double-toast. Deliberate dedupe.
//   • `isSilencedTurnAbort(error)` — the hook-side suppression. A stale lock rejects the AWAITED turn verb
//     (send/swipe/continue/impersonate/generate) LOUDLY with the `aborted` op-code (server engine
//     `runInLockWithHeartbeat`), which each hook's generic `errorToast` would surface as "couldn't send /
//     swipe / …". That generic toast is now redundant with — and less honest than — the bus notice, so the
//     hooks route their `errorToast` through this predicate and stay silent for the `aborted` code, letting
//     the single bus notice own the stale surface. It is `aborted`-NARROW on purpose: a REAL fault (any
//     other code, or a codeless network error) still toasts, so nothing genuine is swallowed.

import type { TurnAbortReason } from "@orb/contracts/chat";
import { TURN_ABORTED_OP_CODE } from "@orb/contracts/chat";

/** The honest stale-abort copy — plain user language, no lock vocabulary. States what happened (another
 *  session took over) AND the resulting state (nothing partial was saved) so the user isn't left guessing. */
export const TURN_STALE_ABORT_COPY =
  "Generation stopped — the chat was taken over by another session. Your message wasn't saved, so nothing was added to the conversation.";

/** Bus-side: the user-visible notice for a `turnAborted` reason, or `null` for no notice. `stale` → the
 *  honest copy; `user` → silence (they cancelled); `error` → silence HERE (the tRPC error boundary owns it,
 *  see file header — notifying on both paths double-toasts). */
export function turnAbortNotice(reason: TurnAbortReason): string | null {
  switch (reason) {
    case "stale":
      return TURN_STALE_ABORT_COPY;
    case "user":
    case "error":
      return null;
    default:
      return assertNeverReason(reason);
  }
}

function assertNeverReason(reason: never): null {
  throw new Error(`turnAbortNotice: unhandled TurnAbortReason ${JSON.stringify(reason)}`);
}

/** The refusal reason off a tRPC error's `data.reason` (the formatter's honest domain code), else "".
 *  Mirrors the `agent-seat` reader — the client keys on the structured wire field, never message text. */
function reasonOf(error: unknown): string {
  const data = typeof error === "object" && error !== null && "data" in error ? (error as { data: unknown }).data : null;
  return typeof data === "object" && data !== null && "reason" in data && typeof (data as { reason: unknown }).reason === "string"
    ? (data as { reason: string }).reason
    : "";
}

/** Hook-side: `true` when a turn-mutation error is the loud `aborted` lifecycle reject (a stale lock killed
 *  the awaited turn) — the caller suppresses its generic error toast so the bus notice is the single stale
 *  surface. Narrow: any other code / a codeless network error is NOT silenced (a real fault still toasts). */
export function isSilencedTurnAbort(error: unknown): boolean {
  return reasonOf(error) === TURN_ABORTED_OP_CODE;
}
