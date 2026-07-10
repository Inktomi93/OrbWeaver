// transport/jobs/oidc-gc-scheduler — the recurring DRIVER that reaps EXPIRED/ABANDONED OIDC PKCE transactions
// from `oidc_transactions`. An abandoned tx (a PKCE flow that mints a row then never returns to the callback) is
// otherwise never deleted — `consume` only sweeps opportunistically at redeem-time, so a user who bounces mid-login
// leaves a row that lives forever. This driver bounds that: it calls the store's `deleteExpired` on a cadence.
//
// WHY A DIRECT SWEEP, NOT A WORKLOAD: the sibling `catalog-refresh-scheduler` enqueues a WORKLOAD because its work
// is external I/O (an OpenRouter fetch) that must be observable + retryable in Settings → Workloads. An OIDC-tx GC
// is a trivial idempotent DELETE — no external I/O, nothing a user observes or retries — so it follows the
// `workloads-worker` reap precedent (`reapOnce` calls the reap op DIRECTLY) rather than the workload indirection.
// This is a legal transport → domain downward call (the store's `deleteExpired` op is injected at entry/).
//
// BOUNDARIES: the driver constructs NOTHING. The sweep op (`OidcStore.deleteExpired` bound to the real db + clock),
// the clock, and the interval timer are ALL injected at entry/. It imports only `getLog` (downward, legal). That is
// also what makes it testable: a test passes a fake `sweep` + a frozen clock + a synchronous timer stub.
//
// DETERMINISM: `now` + `scheduleInterval` are injected (no ambient `Date.now`/`setInterval`). The testable core
// `runOidcGc` takes one sweep and returns; the loop fires it at boot + on the injected timer.

import { getLog } from "#foundation/observability";

const LOG_COMPONENT = "oidc-gc-scheduler";

const MS_PER_HOUR = 3_600_000;

/** Sweep cadence. PKCE transactions are short-lived (10-min TTL); an hourly reap is generous — an abandoned row
 *  is at most ~1h past its (already-rejected) expiry before it is deleted, which only bounds table growth. */
const OIDC_GC_INTERVAL_MS = MS_PER_HOUR;

/** A timer seam (entry wires `setInterval`; tests pass a synchronous fake). Returns a `clear` closure so the
 *  handle type never leaks. */
type ScheduleOp = (fn: () => void, ms: number) => () => void;

/** The DI bundle the scheduler closes over — the store sweep op + clock + timer, injected at entry/. */
export interface OidcGcSchedulerDeps {
  /** Reap every tx with `expiresAt <= before`, returning the count. Entry binds `createOidcStore(...).deleteExpired`. */
  readonly sweep: (before: number) => Promise<number>;
  /** The injected clock — the reap gates on it (no ambient `Date.now`). */
  readonly now: () => number;
  readonly scheduleInterval: ScheduleOp;
  readonly intervalMs?: number;
}

/**
 * ONE reap step: delete every expired transaction as of `now`. The testable core — a test stubs `sweep` + a
 * frozen clock and asserts the sweep fires with the current instant. Logs the count only when something was
 * reaped (idle sweeps are silent).
 */
export async function runOidcGc(deps: OidcGcSchedulerDeps): Promise<void> {
  const log = getLog().child({ component: LOG_COMPONENT });
  const reaped = await deps.sweep(deps.now());
  if (reaped > 0) {
    log.info({ reaped }, "oidc-gc: reaped expired/abandoned transactions");
  }
}

/**
 * Start the scheduler: one immediate boot sweep (clears rows abandoned while the process was down) + the
 * recurring reap on the injected timer. Returns the `clear` closure so entry's lifecycle can tear the timer down
 * on shutdown. A sweep error never takes the process down — it is logged and the next tick retries.
 */
export function startOidcGcScheduler(deps: OidcGcSchedulerDeps): () => void {
  const log = getLog().child({ component: LOG_COMPONENT });
  const intervalMs = deps.intervalMs ?? OIDC_GC_INTERVAL_MS;

  const safeSweep = (): void => {
    runOidcGc(deps).catch((err: unknown) => {
      log.error({ err }, "oidc-gc: sweep failed (next tick retries)");
    });
  };

  safeSweep();
  return deps.scheduleInterval(safeSweep, intervalMs);
}
