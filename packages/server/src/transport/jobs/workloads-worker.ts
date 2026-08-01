// transport/jobs/workloads-worker — THE workloads DRIVER (the analogue of tRPC for the chat verbs). It
// decides WHICH row + WHEN, then calls DOWN into the `domain/workloads` engine entry points to run it; the
// per-row state machine (`runWorkload`) lives in the domain — jobs DRIVES it on a loop. Crosses ZERO feature
// boundaries (transport.md §"job drivers → the workloads front door").
//
// BOUNDARIES (domain-no-cross-feature / drivers-through-domain): this driver constructs NOTHING. The engine
// ops (`nextRunnable`/`run`/`reap`/`load`), the wake source (`workloadStreamEmitter`), and the
// `WorkloadRunnerDeps` (the cross-feature `env` hub + the per-owner binder) are ALL injected — the entry/
// composition root wires the real front-door functions in. This file imports only TYPES from the workloads
// front door + `getLog` from foundation (downward, legal). That is also what makes the loop testable: a test
// passes fake ops + a frozen clock + synchronous timer stubs (transport.md determinism / spine/testing §3).
//
// DETERMINISM: the clock (`runnerDeps.now`) + the loop timers (`scheduleInterval`/`scheduleTimeout`) are
// injected — NO ambient `setInterval`/`setTimeout`/`Date.now` in the testable core. The tick functions
// (`claimAndRunNext`/`reapOnce`) take one step and return; the loop composes them with the injected timers.
//
// LIFECYCLE (neo parity, re-tiered): boot reap (orphans from a prior lifetime) → periodic reap tick (a fast
// crash-restart or a sibling replica's death the boot reap misses) → poll loop (claim → run) → wake-on-emit
// (an enqueued row short-circuits the poll wait) → SIGTERM aborts the loop AND is threaded into the run so an
// in-flight workload aborts to `cancelled`. The cross-replica lock is the DB partial-unique index (the claim
// loser polls the next row); no leader election.

import type { Db } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadContributions, WorkloadRowAnyKind, WorkloadRunnerDeps } from "#domain/workloads";
import { getLog } from "#foundation/observability";

const LOG_COMPONENT = "workloads-worker";

// Idle poll cadence (queue empty). Fast enough that an admin "Run X" starts within the cadence; slow enough
// that idle DB cost is one indexed select per period.
const DEFAULT_POLL_INTERVAL_MS = 2000;
// Busy poll cadence (a row just ran) — shorter, the queue is likely warm.
const DEFAULT_BUSY_POLL_INTERVAL_MS = 200;
// Periodic orphan-reap cadence. Slow — correctness recovery, not a hot path.
const DEFAULT_REAP_INTERVAL_MS = 60_000;

// ── Injected op shapes (entry wires the real front-door fns; tests pass fakes). File-local: the structural
//    shape rides on `WorkloadsWorkerDeps` (the one exported surface) — entry provides functions, not the
//    aliases. ───────────────────────────────────────────────────────────────────────────────────────────

// `nextRunnableWorkload` — the queue-head poll (front door).
type NextRunnableOp = (db: Db, contributions: WorkloadContributions, now: number) => Promise<WorkloadRowAnyKind | null>;
// `runWorkload` — drive ONE claimed row end-to-end (the domain's per-row state machine; front door).
type RunWorkloadOp = (deps: WorkloadRunnerDeps, row: WorkloadRowAnyKind, signal: AbortSignal) => Promise<void>;
// `reapOrphanedWorkloads` — sweep stale in-flight rows from dead workers (front door).
type ReapOp = (args: { db: Db; contributions: WorkloadContributions; now: number; staleThresholdMs?: number }) => Promise<number>;
// `loadWorkload` — the by-id re-read the post-dispatch hot-loop guard uses (front door).
type LoadWorkloadOp = (db: Db, contributions: WorkloadContributions, id: WorkloadId) => Promise<WorkloadRowAnyKind | null>;
// Subscribe to the workload event bus (`workloadStreamEmitter`); returns the unsubscribe. Injected so the
// driver never imports the bus directly.
type SubscribeWakeOp = (listener: () => void) => () => void;
// A timer seam (entry wires `setInterval`/`setTimeout`; tests pass synchronous fakes). Returns a `clear`
// closure so the handle type never leaks (no `NodeJS.Timeout`/`ReturnType<>` in the surface).
type ScheduleOp = (fn: () => void, ms: number) => () => void;

/** The DI bundle the worker driver closes over — every cross-feature/engine/timer dep injected at entry/. */
export interface WorkloadsWorkerDeps {
  /** The per-dispatch runner deps (db + the cross-feature `env` hub + the per-owner binder + the injected
   *  clock + the lease cadences). Built at entry/compose; the worker threads it straight into `run`. */
  readonly runnerDeps: WorkloadRunnerDeps;
  /** Aborts the loop on shutdown AND is threaded into `run` so an in-flight workload aborts to `cancelled`. */
  readonly signal: AbortSignal;
  readonly nextRunnable: NextRunnableOp;
  readonly run: RunWorkloadOp;
  readonly reap: ReapOp;
  readonly load: LoadWorkloadOp;
  readonly subscribeWake: SubscribeWakeOp;
  readonly scheduleInterval: ScheduleOp;
  readonly scheduleTimeout: ScheduleOp;
  readonly pollIntervalMs?: number;
  readonly busyPollIntervalMs?: number;
  readonly reapIntervalMs?: number;
}

/** The outcome of one poll tick — `ran` (a row was dispatched) + `backOff` (poll/queue trouble → wait the
 *  full idle period instead of the busy cadence, so a wedged row burns one warning per period, not a flood). */
export interface WorkerTickOutcome {
  readonly ran: boolean;
  readonly backOff: boolean;
}

/**
 * ONE poll step: query the queue head, and if a row is runnable, dispatch it through the injected `run`.
 * The testable core — a test mocks `nextRunnable`/`run`/`load` and asserts the claim + dispatch with a
 * deterministic clock. Engine throws are caught + logged (the reaper recovers a wedged row); a row still
 * `queued` after dispatch signals a back-off.
 */
export async function claimAndRunNext(deps: WorkloadsWorkerDeps): Promise<WorkerTickOutcome> {
  const { db, contributions, now } = deps.runnerDeps;
  const log = getLog().child({ component: LOG_COMPONENT });

  let row: WorkloadRowAnyKind | null;
  try {
    row = await deps.nextRunnable(db, contributions, now());
  } catch (err) {
    log.error({ err }, "workloads-worker: poll query failed (backing off)");
    return { ran: false, backOff: true };
  }
  if (row === null) {
    return { ran: false, backOff: false };
  }

  const id: WorkloadId = row.id;
  try {
    // Thread the shutdown signal INTO the run so a SIGTERM mid-workload aborts the in-flight run (the engine
    // composes it with its cancel-poll controller). runWorkload records runner-side throws on the row itself.
    await deps.run(deps.runnerDeps, row, deps.signal);
    log.info({ workloadId: id, kind: row.kind }, "workloads-worker: workload finished");
  } catch (err) {
    // A throw HERE is the engine's own bookkeeping blowing up (a db write, etc.). Log + continue — the row
    // may be wedged in 'running'; the reaper picks it up after the stale threshold.
    log.error({ err, workloadId: id, kind: row.kind }, "workloads-worker: engine threw");
  }

  // Defensive re-read: a row STILL 'queued' after dispatch (the engine threw before claiming) would re-pick
  // the same row and hot-loop on the busy cadence — back off to the full idle period instead.
  if (!deps.signal.aborted) {
    try {
      const after = await deps.load(db, contributions, id);
      if (after?.status === "queued") {
        log.warn({ workloadId: id, kind: row.kind }, "workloads-worker: row still 'queued' after dispatch — backing off a full poll period");
        return { ran: true, backOff: true };
      }
    } catch (err) {
      log.warn({ err, workloadId: id }, "workloads-worker: post-dispatch status re-read failed");
    }
  }

  return { ran: true, backOff: false };
}

/** ONE reap step: sweep orphaned in-flight rows. The testable core for the periodic reap tick + the boot
 *  reap. Errors are logged + swallowed (the reaper must never take the loop down). */
export async function reapOnce(deps: WorkloadsWorkerDeps): Promise<number> {
  const { db, contributions, now } = deps.runnerDeps;
  const log = getLog().child({ component: LOG_COMPONENT });
  try {
    const reaped = await deps.reap({ db, contributions, now: now() });
    if (reaped > 0) {
      log.info({ reaped }, "workloads-worker: reaped orphans");
    }
    return reaped;
  } catch (err) {
    log.error({ err }, "workloads-worker: reap failed (continuing)");
    return 0;
  }
}

/**
 * Run the worker until `signal` aborts. Composes the tick cores with the injected timers: boot reap → start
 * the periodic reap tick → subscribe wake-on-emit → poll loop. Resolves once the loop observes the abort and
 * tears the timers + listener down. The loop reads NO ambient clock or timer — all injected.
 */
export async function startWorkloadsWorker(deps: WorkloadsWorkerDeps): Promise<void> {
  const log = getLog().child({ component: LOG_COMPONENT });
  const pollMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const busyMs = deps.busyPollIntervalMs ?? DEFAULT_BUSY_POLL_INTERVAL_MS;
  const reapMs = deps.reapIntervalMs ?? DEFAULT_REAP_INTERVAL_MS;

  // Boot reap — orphans from a prior lifetime (idempotent; the verb's status guard protects terminal rows).
  await reapOnce(deps);

  // Periodic reap tick — the boot reap alone misses a fast crash-restart + a sibling replica's death. Errors
  // are swallowed inside reapOnce; nothing here can kill the poll loop.
  const clearReap = deps.scheduleInterval(() => {
    void reapOnce(deps);
  }, reapMs);

  // Wake-on-emit: ANY workload event (started/terminal) wakes the loop to look for more work immediately,
  // so there is never a poll-period gap between back-to-back items. The ref holds the CURRENT sleep's
  // resolver; a fired event resolves it early.
  const wakeRef: { current: (() => void) | null } = { current: null };
  const unsubscribe = deps.subscribeWake(() => {
    wakeRef.current?.();
  });

  // An abortable, wakeable sleep over the injected timer. Whichever fires first wins: the timer, the abort,
  // or an emitted event.
  const sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      let settled = false;
      let cancelTimer: (() => void) | null = null;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cancelTimer?.();
        deps.signal.removeEventListener("abort", onAbort);
        if (wakeRef.current === finish) {
          wakeRef.current = null;
        }
        resolve();
      };
      const onAbort = (): void => {
        finish();
      };
      cancelTimer = deps.scheduleTimeout(finish, ms);
      deps.signal.addEventListener("abort", onAbort, { once: true });
      wakeRef.current = finish;
    });

  log.info({ pollIntervalMs: pollMs }, "workloads-worker: poll loop started");
  try {
    while (!deps.signal.aborted) {
      // biome-ignore lint/performance/noAwaitInLoops: a poll loop is sequential BY DESIGN — claim one row, run it to completion, then poll the next; concurrency would race the single-active-per-kind DB lock.
      const outcome = await claimAndRunNext(deps);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsc narrows `while (!deps.signal.aborted)` as still false here, but `.aborted` is a live getter that can flip true during the `await` above (shutdown mid-claim)
      if (deps.signal.aborted) {
        break;
      }
      const waitMs = outcome.ran && !outcome.backOff ? busyMs : pollMs;
      // The loop MUST pace between polls (idle/busy cadence) — the sleep is the wakeable back-pressure seam.
      await sleep(waitMs);
    }
  } finally {
    clearReap();
    unsubscribe();
    log.info("workloads-worker: poll loop stopped");
  }
}
