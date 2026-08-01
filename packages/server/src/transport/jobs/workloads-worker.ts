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
// crash-restart or a sibling replica's death the boot reap misses) → ONE POLL LOOP PER EXECUTION LANE (claim
// → run) → wake-on-emit (an enqueued row short-circuits every lane's poll wait) → SIGTERM aborts the loops
// AND is threaded into the runs so in-flight workloads abort to `cancelled`. The cross-replica lock is the DB
// partial-unique index (the claim loser polls the next row); no leader election.
//
// LANES: each `WorkloadLane` gets its own independent loop (`laneConcurrency` workers each, default 1), and
// each loop polls ONLY its lane's queue head. That is the whole fix for the head-blocking defect — a
// 20-minute `import-st` on the `sweep` lane cannot delay a user's `databank-ingest` on `interactive`. The
// per-lane loop stays sequential BY DESIGN (see the poll-loop comment); lanes are EXECUTION, the single-active
// unique indexes are ADMISSION, and the two never interact.

import type { WorkloadLane } from "@orb/contracts/workloads";
import { WORKLOAD_LANES } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadContributions, WorkloadRowAnyKind, WorkloadRunnableRow, WorkloadRunnerDeps } from "#domain/workloads";
import { getLog } from "#foundation/observability";

const LOG_COMPONENT = "workloads-worker";

// Idle poll cadence (queue empty). Fast enough that an admin "Run X" starts within the cadence; slow enough
// that idle DB cost is one indexed select per period.
const DEFAULT_POLL_INTERVAL_MS = 2000;
// Busy poll cadence (a row just ran) — shorter, the queue is likely warm.
const DEFAULT_BUSY_POLL_INTERVAL_MS = 200;
// Periodic orphan-reap cadence. Slow — correctness recovery, not a hot path.
const DEFAULT_REAP_INTERVAL_MS = 60_000;
// Workers per lane. ONE keeps each lane's dispatch sequential (the DB single-active indexes are the real
// guard, but a second worker in the same lane only adds claim races). Widening is a dep, not a migration.
const DEFAULT_LANE_CONCURRENCY = 1;

// ── Injected op shapes (entry wires the real front-door fns; tests pass fakes). File-local: the structural
//    shape rides on `WorkloadsWorkerDeps` (the one exported surface) — entry provides functions, not the
//    aliases. ───────────────────────────────────────────────────────────────────────────────────────────

// `nextRunnableWorkload` — the LANE-SCOPED queue-head poll (front door).
type NextRunnableOp = (db: Db, contributions: WorkloadContributions, now: number, lane: WorkloadLane) => Promise<WorkloadRunnableRow | null>;
// `runWorkload` — drive ONE claimed row end-to-end (the domain's per-row state machine; front door).
type RunWorkloadOp = (deps: WorkloadRunnerDeps, row: WorkloadRunnableRow, signal: AbortSignal) => Promise<void>;
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
  /** Workers per execution lane (default 1 each). The seam is the lane TUPLE + the row's column; widening a
   *  lane to N is this dep, never a migration. A lane omitted here runs the default, not zero workers. */
  readonly laneConcurrency?: Partial<Record<WorkloadLane, number>>;
}

/** The outcome of one poll tick — `ran` (a row was dispatched) + `backOff` (poll/queue trouble → wait the
 *  full idle period instead of the busy cadence, so a wedged row burns one warning per period, not a flood). */
export interface WorkerTickOutcome {
  readonly ran: boolean;
  readonly backOff: boolean;
}

/**
 * ONE poll step FOR ONE LANE: query that lane's queue head, and if a row is runnable, dispatch it through the
 * injected `run`. The testable core — a test mocks `nextRunnable`/`run`/`load` and asserts the claim +
 * dispatch with a deterministic clock. Engine throws are caught + logged (the reaper recovers a wedged row);
 * a row still `queued` after dispatch signals a back-off.
 */
export async function claimAndRunNext(deps: WorkloadsWorkerDeps, lane: WorkloadLane): Promise<WorkerTickOutcome> {
  const { db, contributions, now } = deps.runnerDeps;
  const log = getLog().child({ component: LOG_COMPONENT, lane });

  let row: WorkloadRunnableRow | null;
  try {
    row = await deps.nextRunnable(db, contributions, now(), lane);
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
 * the periodic reap tick → subscribe wake-on-emit → ONE POLL LOOP PER LANE (× `laneConcurrency`). Resolves
 * once every loop observes the abort and the timers + listener are torn down. The loops read NO ambient clock
 * or timer — all injected.
 */
export async function startWorkloadsWorker(deps: WorkloadsWorkerDeps): Promise<void> {
  const log = getLog().child({ component: LOG_COMPONENT });
  const pollMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const busyMs = deps.busyPollIntervalMs ?? DEFAULT_BUSY_POLL_INTERVAL_MS;
  const reapMs = deps.reapIntervalMs ?? DEFAULT_REAP_INTERVAL_MS;

  // Boot reap — orphans from a prior lifetime (idempotent; the verb's status guard protects terminal rows).
  await reapOnce(deps);

  // Periodic reap tick — the boot reap alone misses a fast crash-restart + a sibling replica's death. Errors
  // are swallowed inside reapOnce; nothing here can kill the poll loops.
  const clearReap = deps.scheduleInterval(() => {
    void reapOnce(deps);
  }, reapMs);

  // Wake-on-emit: ANY workload event (started/terminal) wakes EVERY sleeping lane to look for more work
  // immediately, so there is never a poll-period gap between back-to-back items. The set holds each sleeping
  // loop's resolver (one per lane worker); a fired event resolves them all.
  const waiters = new Set<() => void>();
  const unsubscribe = deps.subscribeWake(() => {
    for (const wake of [...waiters]) {
      wake();
    }
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
        waiters.delete(finish);
        resolve();
      };
      const onAbort = (): void => {
        finish();
      };
      cancelTimer = deps.scheduleTimeout(finish, ms);
      deps.signal.addEventListener("abort", onAbort, { once: true });
      waiters.add(finish);
    });

  /** ONE lane's poll loop — sequential within the lane, independent of every other lane. */
  const runLane = async (lane: WorkloadLane): Promise<void> => {
    while (!deps.signal.aborted) {
      // biome-ignore lint/performance/noAwaitInLoops: a lane's poll loop is sequential BY DESIGN — claim one row, run it to completion, then poll the next; parallelism inside a lane would only race the single-active-per-kind DB lock (cross-lane parallelism is the sibling loops).
      const outcome = await claimAndRunNext(deps, lane);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsc narrows `while (!deps.signal.aborted)` as still false here, but `.aborted` is a live getter that can flip true during the `await` above (shutdown mid-claim)
      if (deps.signal.aborted) {
        break;
      }
      const waitMs = outcome.ran && !outcome.backOff ? busyMs : pollMs;
      // The loop MUST pace between polls (idle/busy cadence) — the sleep is the wakeable back-pressure seam.
      await sleep(waitMs);
    }
  };

  const loops = WORKLOAD_LANES.flatMap((lane) => {
    const workers = deps.laneConcurrency?.[lane] ?? DEFAULT_LANE_CONCURRENCY;
    return Array.from({ length: workers }, () => runLane(lane));
  });

  log.info({ pollIntervalMs: pollMs, lanes: WORKLOAD_LANES, loops: loops.length }, "workloads-worker: poll loops started");
  try {
    await Promise.all(loops);
  } finally {
    clearReap();
    unsubscribe();
    log.info("workloads-worker: poll loops stopped");
  }
}
