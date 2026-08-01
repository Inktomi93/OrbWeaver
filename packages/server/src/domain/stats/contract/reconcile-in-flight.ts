// domain/stats/contract/reconcile-in-flight — the per-user single-flight registry TYPE. Homed here per the
// `types-in-contract` gate (an exported feature type lives in contract/, never on the root file); the
// registry FACTORY (`createReconcileInFlight`) is the value home at the stats root, the
// `chat/contract/active-turns.ts` ↔ `chat/active-turns.ts` precedent. Behavior + the in-memory sanction:
// `../reconcile-in-flight.ts`.

import type { UserId } from "@orb/kit/ids";

/** The in-memory per-OWNER single-flight gate for `stats.reconcile` (one instance per service ⇒ per replica). */
export interface ReconcileInFlight {
  /** Run `task` unless this owner already has one in flight — a second call is REFUSED with a
   *  `DomainConflictError` (CONFLICT) instead of queueing or racing. The slot releases on settle, both arms. */
  readonly run: <T>(ownerId: UserId, task: () => Promise<T>) => Promise<T>;
  /** Whether this owner currently holds the slot (the release-proof / observability hook — `countActive`
   *  precedent). */
  readonly isRunning: (ownerId: UserId) => boolean;
}
