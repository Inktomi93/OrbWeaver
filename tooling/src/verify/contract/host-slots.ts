// The vocabulary of the HOST-WIDE SLOT POOL (#1835) — "at most N of these may run on this BOX at once".
// Mechanism + rationale: ../lib/host-slots.ts. Two consumers today: the whole-run verify queue
// (`ops/run.ts`, one slot) and the CT runner cap (`lib/ct-runner-lock.ts`, `ctRunnersHostWide` slots).

/** One pool's identity and policy. `slots` comes from tooling/concurrency-profile.json — never a literal. */
export interface HostSlotPool {
  /** Directory suffix and the name a notice prints: the pool lives at `<runtime>/orb-<name>-slots/`. */
  readonly name: string;
  /** Recorded in the slot file so an operator reading `/run/user/<uid>` sees WHAT holds it, not just a pid. */
  readonly label: string;
  readonly slots: number;
  /** The QUIET-BOX base for how long a blocked caller waits before proceeding unslotted; load-scaled
   *  through `_shared/load-budget.ts` at acquire time, because a contended box has a legitimately longer
   *  queue and a ceiling written for a quiet one would degrade the pool exactly when it matters most. */
  readonly waitBaseMs: number;
}

/** Who holds a slot, as its file records it. */
export interface HostSlotHolder {
  readonly pid: number;
  readonly startedAt: string;
  readonly label: string;
}

/** A caller ALWAYS gets one of these — the pool queues, it never refuses (../lib/host-slots.ts header).
 *  `slot` is `null` when the wait ceiling was reached and the pool degraded to uncapped; `release()` is
 *  idempotent and is called from a `finally`. */
export interface HostSlotLease {
  readonly slot: number | null;
  readonly waitedMs: number;
  readonly release: () => void;
}
