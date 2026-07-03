// domain/chat/contract/active-turns — the in-memory turn-controller registry TYPES. Homed here per the
// `types-in-contract` gate (an
// exported feature type lives in contract/, never on the root `active-turns.ts` file); the registry FACTORY
// (`createActiveTurns`) is the value home at the chat root. See `../active-turns.ts` for the behavior + flags.

import type { ChatId, UserId } from "@orb/kit/ids";

/** A live turn registration — the caller threads `signal` into the abortable work (the auto-mode chain) and
 *  MUST `release()` it in a `finally` (so a completed turn leaves the registry clean). */
export interface ActiveTurnHandle {
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
  /** How many turns are currently in flight for `chatId` (a test/observability hook). */
  readonly countActive: (chatId: ChatId) => number;
}
