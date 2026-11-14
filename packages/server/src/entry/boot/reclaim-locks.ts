// Boot step: single-replica reclaim of stale claims a dead process left behind. Single replica means no
// worker survived the restart, so EVERY in-flight row/held lock is orphaned by definition — the
// steady-state reaper's heartbeat grace is wrong here. rate_limit buckets are self-expiring, skipped.
//
// ORPHANED ≠ LOST. The mechanism above is unchanged — every in-flight row IS orphaned — but the
// DISPOSITION is no longer uniformly terminal: `reclaimInFlightOnBoot` re-queues the orphans whose kind
// declares itself re-runnable and reaps the rest, bounded by a respawn counter, and it finishes the cancel
// on a row whose owner had asked it to stop. `node --watch` re-execs the
// server on any watched-source write, so a merge, a manual restart or a gate fixture plant would kill a
// multi-hour backfill outright without it. The rows it DOES reap keep the restart-class
// attribution — the reclaim stamps them through the same shared reap sentences the steady-state sweep
// uses, so a boot death never reads as a stale heartbeat.

import type { BootDatabaseHandle } from "@orb/db/wiring";
import type { Clock } from "@orb/kit/time";
import { reclaimChatLocksOnBoot, sweepLandingChatsOnBoot } from "#domain/chat";
import type { WorkloadContributions, WorkloadProgressBus } from "#domain/workloads";
import { reclaimInFlightOnBoot } from "#domain/workloads";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";

export interface ReclaimLocksDeps {
  readonly logger: Logger;
  readonly emitWorkloadEvent: WorkloadProgressBus["emitWorkloadEvent"];
  readonly db: BootDatabaseHandle;
  /** The contribution registry the row read path validates params against (poison tolerance), and the
   *  reclaim reads each kind's declared `resume` policy from. */
  readonly contributions: WorkloadContributions;
  readonly now: Clock;
  /** This replica's stable lock-holder tag — MUST match the tag chat acquires turn-locks under. */
  readonly holder: string;
}

/** Delete the imported rooms a dead import left landing, dispose of orphaned in-flight workloads (finish a raised
 *  cancel, re-queue the resumable, reap the rest) + reclaim this replica's orphaned chat turn-locks. Returns the
 *  TOTAL number of rooms/rows/locks moved; the per-disposition breakdown is in the log line, because "N
 *  reclaimed" is what made a lost multi-hour backfill read as boot noise. */
export async function reclaimLocksOnBoot(deps: ReclaimLocksDeps): Promise<number> {
  // First, so a re-queued import finds no claim held by a room that will never land.
  const landingChats = await sweepLandingChatsOnBoot(deps.db);
  const workloads = await reclaimInFlightOnBoot({
    logger: deps.logger,
    db: deps.db,
    contributions: deps.contributions,
    now: deps.now(),
    emitEvent: deps.emitWorkloadEvent,
  });
  const chatLocks = await reclaimChatLocksOnBoot(deps.db, deps.holder);
  getLog(deps.logger).info(
    { landingChats, requeued: workloads.requeued, reaped: workloads.reaped, cancelled: workloads.cancelled, chatLocks },
    "boot/reclaim-locks: deleted rooms left landing, finished raised workload cancels, re-queued resumable in-flight workloads, reaped the rest, reclaimed chat turn-locks",
  );
  return landingChats + workloads.requeued + workloads.reaped + workloads.cancelled + chatLocks;
}
