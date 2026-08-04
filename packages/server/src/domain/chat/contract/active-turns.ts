// domain/chat/contract/active-turns — the in-memory turn-controller registry TYPES. Homed here per the
// `types-in-contract` gate (an
// exported feature type lives in contract/, never on the root `active-turns.ts` file); the registry FACTORY
// (`createActiveTurns`) is the value home at the chat root. See `../active-turns.ts` for the behavior + flags.

import type { ChatId, UserId } from "@orb/kit/ids";

/** A live turn registration — the caller threads `signal` into the abortable work (the auto-mode chain) and
 *  MUST release it when the turn ends (so a completed turn leaves the registry clean).
 *
 *  It is `Disposable`, and `using handle = activeTurns.register(...)` is THE spelling at a verb: the release
 *  then rides scope exit (normal return, throw, or abort alike) instead of a hand-written `finally`, and it
 *  also covers the window between `register()` and the old `try` — where a throw used to strand the
 *  registration and leave a phantom in-flight turn that made `abort` report `foreignInFlight`. `release()`
 *  stays the NAMED operation (`[Symbol.dispose]` is bound to it, not a second implementation) for the callers
 *  whose release is not scope-shaped; it is idempotent, so both spellings compose. */
export interface ActiveTurnHandle extends Disposable {
  readonly signal: AbortSignal;
  readonly release: () => void;
}

/** The outcome of an `abort` sweep: how many of the CALLER's turns were signalled + whether a turn owned by
 *  SOMEONE ELSE is still in flight (the verb refuses with `not_turn_owner` when the caller aborted nothing but
 *  a foreign turn exists — the rollback-theft defense). */
export interface AbortResult {
  readonly aborted: number;
  readonly foreignInFlight: boolean;
}

/** The in-memory per-chat controller registry (one instance per replica; built at the composition root). */
export interface ActiveTurns {
  /** Register an in-flight turn for `chatId` owned by `ownerUserId` (the `triggeredBy` — D19). */
  readonly register: (chatId: ChatId, ownerUserId: UserId) => ActiveTurnHandle;
  /** Signal every in-flight turn for `chatId` owned by `principalUserId`; report any foreign in-flight turn. */
  readonly abort: (chatId: ChatId, principalUserId: UserId) => AbortResult;
  /** Signal EVERY in-flight turn for `chatId`, owner-blind, and return how many were signalled. Not the
   *  owner-only `abort`: this is the ROOM-GONE sweep (host delete) — once the chat row is dropped no turn in it
   *  can commit anything, so generating on is pointless and every event it emits is a dropped write. The
   *  rollback-theft defense does not apply (there is no chat left to steal a rollback in). */
  readonly abortAll: (chatId: ChatId) => number;
  /** How many turns are currently in flight for `chatId` (a test/observability hook). */
  readonly countActive: (chatId: ChatId) => number;
}
