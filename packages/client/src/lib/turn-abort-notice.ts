// The turn-notice mapper — the ONE testable home for the coupled decisions a turn's two failure surfaces
// need (owner-approved enhancement). All pure; the CT QueryClient has no MutationCache seam so toast copy is
// unobservable in a CT — this mapper is unit-tested instead (the ct-queryclient precedent), and the bus
// reducer + the turn-mutation hooks stay one-liners over it.
//
// WHY these functions, one home:
//   • `turnAbortNotice(reason)` — the bus-side surface. `applyChatBusEvent` sees EVERY turnAborted (SSE),
//     including detached auto-mode turns no awaiting caller sees, so the bus is the one place a stale abort
//     is always observable. `stale` → the honest notice; `user` (deliberate cancel) → nothing; `error` →
//     nothing HERE — a real fault ALSO throws out the awaited verb and rides the tRPC error boundary
//     (query-client `meta.errorToast`), so notifying on the bus too would double-toast. Deliberate dedupe.
//   • `turnMutationToast(error, fallback)` — the hook-side surface, the ONE `errorToast` every turn-starting
//     mutation passes (send/swipe/continue/generate/impersonate/summon). Three outcomes, decided once:
//     `aborted` → SILENT (a stale lock rejects the AWAITED verb loudly with that op-code — server engine
//     `runInLockWithHeartbeat` — and the bus notice above already owns that surface, so a generic "couldn't
//     send" there would double-toast and say less); `locked` → the CONTENTION copy, which the fallback used
//     to hide; anything else → the caller's verb-specific fallback, so a real fault still toasts and nothing
//     genuine is swallowed.

import type { TurnAbortReason } from "@orb/contracts/chat";
import { TURN_ABORTED_OP_CODE, TURN_LOCKED_OP_CODE } from "@orb/contracts/chat";

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

/** `true` when a turn-mutation error is the loud `aborted` lifecycle reject (a stale lock killed the awaited
 *  turn) — the toast is suppressed so the bus notice is the single stale surface. Narrow: any other code / a
 *  codeless network error is NOT silenced (a real fault still toasts). Exported for the OTHER decision that
 *  keys on the same fact: the guided wand's draft-restore, which hands a fired steer back on any failure
 *  EXCEPT this one (an abort is a user stop, not a lost steer — `use-guided-actions.ts` perFire). The toast
 *  decision itself routes through `turnMutationToast` below, never this predicate directly. */
export function isSilencedTurnAbort(error: unknown): boolean {
  return reasonOf(error) === TURN_ABORTED_OP_CODE;
}

/** The honest copy for a CONTENTION refusal (`locked` — the per-chat turn lock is held, engine
 *  `createTurnEngine`). States what is true (another turn is running here), what it means (nothing was
 *  written — the refusal is total, no canon, no variant) and the one next step. No lock vocabulary, same
 *  voice as the stale-abort copy above. */
export const TURN_LOCKED_COPY = "Another reply is still generating in this room — nothing was changed. Try again once it finishes.";

/**
 * Hook-side: the toast a turn mutation (send/swipe/continue/generate/impersonate/summon) should show for a
 * failure — or `null` for silence. ONE mapper so every turn call site answers the three outcomes the same
 * way, instead of each spelling its own `isSilencedTurnAbort(e) ? null : "Couldn't …"` ternary:
 *   • `aborted` → null (the bus's `turnAbortNotice` owns the stale surface — see the file header);
 *   • `locked`  → the honest contention copy, which the generic fallback actively HID: the reader was told
 *     "Couldn't generate that swipe" for a refusal that is neither their fault nor permanent, with no ghost
 *     and no other feedback while the OTHER turn ran (measured 2026-08-14: the old text held 74/75 samples
 *     and changed only at 7.8 s, when that turn completed);
 *   • anything else → the caller's own verb-specific fallback (a real fault still toasts, unchanged).
 */
export function turnMutationToast(error: unknown, fallback: string): string | null {
  if (isSilencedTurnAbort(error)) {
    return null;
  }
  if (reasonOf(error) === TURN_LOCKED_OP_CODE) {
    return TURN_LOCKED_COPY;
  }
  return fallback;
}
