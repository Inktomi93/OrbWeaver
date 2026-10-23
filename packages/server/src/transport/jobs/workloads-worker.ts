// transport/jobs/workloads-worker — THE workloads DRIVER (the analogue of tRPC for the chat verbs). It
// decides WHICH row + WHEN, then calls DOWN into the `domain/workloads` engine entry points to run it; the
// per-row state machine (`runWorkload`) lives in the domain — jobs DRIVES it on a loop. Crosses ZERO feature
// boundaries (Tier-4-Transport.md §"job drivers → the workloads front door").
//
// BOUNDARIES (domain-no-cross-feature / drivers-through-domain): this driver constructs NOTHING. The engine
// ops (`nextRunnable`/`run`/`reap`/`load`), the wake subscription, and the
// `WorkloadRunnerDeps` (the cross-feature `env` hub + the per-owner binder) are ALL injected — the entry/
// composition root wires the real front-door functions in. This file imports only TYPES from the workloads
// front door + `getLog` from foundation (downward, legal). That is also what makes the loop testable: a test
// passes fake ops + a frozen clock + synchronous timer stubs (Tier-4-Transport.md determinism / spine/testing §3).
//
// DETERMINISM: the clock (`runnerDeps.now`) + the loop timers (`scheduleInterval`/`scheduleTimeout`) are
// injected — NO ambient `setInterval`/`setTimeout`/`Date.now` in the testable core. The tick functions
// (`claimAndRunNext`/`reapOnce`) take one step and return; the loop composes them with the injected timers.
//
// LIFECYCLE (neo parity, re-tiered): boot reap (orphans from a prior lifetime) → periodic reap tick (a fast
// crash-restart or a sibling replica's death the boot reap misses) → ONE POLL LOOP PER EXECUTION LANE (claim
// → run) → wake-on-emit → SIGTERM aborts the loops AND is threaded into the runs so in-flight workloads abort
// to `cancelled`. The cross-replica lock is the DB partial-unique index (the claim loser polls the next row);
// no leader election.
//
// WAKE-ON-EMIT IS A LIFECYCLE WAKE, NOT AN ENQUEUE WAKE. The bus carries events for rows that are ALREADY
// dispatched (started / progress / terminal), so what the wake buys is zero gap between BACK-TO-BACK items:
// a finishing row wakes every sleeping lane immediately instead of leaving it parked on its poll timer.
// ENQUEUE emits nothing — a freshly queued row (or one that becomes DUE between polls: the `scheduledAt`
// gate is evaluated per poll, never scheduled against) is picked up on the next tick, i.e. within
// `pollIntervalMs` (2 s). That latency is BY DESIGN (see the constant below), not an oversight; do not build
// on a sub-poll enqueue-to-dispatch invariant.
//
// LANES: each `WorkloadLane` gets its own independent loop (`laneConcurrency` workers each, default 1), and
// each loop polls ONLY its lane's queue head. That is the whole fix for the head-blocking defect — a
// 20-minute `import-st` on the `sweep` lane cannot delay a user's `databank-ingest` on `interactive`. The
// per-lane loop stays sequential BY DESIGN (see the poll-loop comment); lanes are EXECUTION, the single-active
// unique indexes are ADMISSION, and the two never interact.

import type { WorkloadLane } from "@orb/contracts/workloads";
import { WORKLOAD_LANES } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadReapReason, WorkloadRunnableRow } from "#domain/workloads";
import { getLog } from "#foundation/observability";
import type { WorkloadsWorkerDeps } from "./contract/workloads-worker.ts";

export type { WorkloadsWorkerDeps } from "./contract/workloads-worker.ts";

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
// COUPLING: memory-backfill admits a whole sweep and an import's scoped runs as distinct units
// (domain/chat/workload-contributions.ts `memoryAdmissionKey`), and relies on the `sweep` lane running them one
// at a time. A sweep lane wider than one would let two of them summarize the same block and pay for it twice.
const DEFAULT_LANE_CONCURRENCY = 1;

/** The outcome of one poll tick — `ran` (a row was dispatched) + `backOff` (poll/queue trouble → wait the
 *  full idle period instead of the busy cadence, so a wedged row burns one warning per period, not a flood). */
interface WorkerTickOutcome {
  readonly ran: boolean;
  readonly backOff: boolean;
}

// ONE poll step FOR ONE LANE: query that lane's queue head, and if a row is runnable, dispatch it through the
// injected `run`. Engine throws are caught + logged (the reaper recovers a wedged row);
// a row still `queued` after dispatch signals a back-off.
async function claimAndRunNext(deps: WorkloadsWorkerDeps, lane: WorkloadLane): Promise<WorkerTickOutcome> {
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

// ONE reap step: sweep orphaned in-flight rows. Errors are logged + swallowed (the reaper must never take the loop down).
async function reapOnce(deps: WorkloadsWorkerDeps, reason: WorkloadReapReason): Promise<number> {
  const { db, now, emitEvent } = deps.runnerDeps;
  const log = getLog().child({ component: LOG_COMPONENT });
  try {
    const reaped = await deps.reap({ db, now: now(), reason, emitEvent });
    if (reaped > 0) {
      log.info({ reaped, reason }, "workloads-worker: reaped orphans");
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

  const initialized = Promise.withResolvers<void>();
  deps.track?.(initialized.promise);
  let clearReap: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    // Boot reap — orphans from a prior lifetime (idempotent; the verb's status guard protects terminal rows).
    // This process just started, so anything still in flight died WITH the previous one: a restart, not a lease
    // that aged out under a live worker (#560 — the two record different sentences on the row).
    await reapOnce(deps, "worker_restart");

    // Periodic reap tick — the boot reap alone misses a fast crash-restart + a sibling replica's death. Errors
    // are swallowed inside reapOnce; nothing here can kill the poll loops. This worker IS alive here, so a row
    // it finds stale genuinely stopped bumping its lease.
    clearReap = deps.scheduleInterval(() => {
      deps.supervise(`workload-reap:${String(deps.runnerDeps.now())}:${deps.newOpaqueId()}`, "workloads.reap", { reason: "heartbeat_stale" }, () =>
        reapOnce(deps, "heartbeat_stale"),
      );
    }, reapMs);

    // Wake-on-emit: ANY workload event (started/progress/terminal — every emitter is a row already in flight)
    // wakes EVERY sleeping lane to look for more work immediately, so there is never a poll-period gap between
    // back-to-back items. A fresh ENQUEUE emits nothing and waits for the next poll (header, "wake-on-emit is a
    // lifecycle wake"). The set holds each sleeping loop's resolver (one per lane worker); a fired event
    // resolves them all.
    const waiters = new Set<() => void>();
    unsubscribe = deps.subscribeWake(() => {
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

    // A call, so the checker does not carry the loop condition's `aborted === false` across the awaited claim/run step.
    const shutdownRequested = (): boolean => deps.signal.aborted;

    /** ONE lane's poll loop — sequential within the lane, independent of every other lane. */
    const runLane = async (lane: WorkloadLane): Promise<void> => {
      while (!deps.signal.aborted) {
        const completed = Promise.withResolvers<void>();
        deps.track?.(completed.promise);
        let sleeping: Promise<void> | undefined;
        try {
          const outcome = await claimAndRunNext(deps, lane);
          if (!shutdownRequested()) {
            const waitMs = outcome.ran && !outcome.backOff ? busyMs : pollMs;
            sleeping = sleep(waitMs);
          }
        } finally {
          // The worker lifetime retains faults; tracking joins this finite step, including sleep registration.
          completed.resolve();
        }
        if (sleeping !== undefined) {
          await sleeping;
        }
      }
    };

    const loops = WORKLOAD_LANES.flatMap((lane) => {
      const workers = deps.laneConcurrency?.[lane] ?? DEFAULT_LANE_CONCURRENCY;
      return Array.from({ length: workers }, () => runLane(lane));
    });

    initialized.resolve();
    log.info({ pollIntervalMs: pollMs, lanes: WORKLOAD_LANES, loops: loops.length }, "workloads-worker: poll loops started");
    await Promise.all(loops);
  } finally {
    initialized.resolve();
    clearReap?.();
    unsubscribe?.();
    log.info("workloads-worker: poll loops stopped");
  }
}
