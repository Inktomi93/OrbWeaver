// Boot step: single-replica reclaim of stale claims a dead process left behind. Single replica means no
// worker survived the restart, so EVERY in-flight row/held lock is orphaned by definition — the
// steady-state reaper's heartbeat grace is wrong here. rate_limit buckets are self-expiring, skipped.
//
// ORPHANED ≠ LOST (#529). The mechanism above is unchanged — every in-flight row IS orphaned — but the
// DISPOSITION is no longer uniformly terminal: `reclaimInFlightOnBoot` re-queues the orphans whose kind
// declares itself re-runnable and reaps the rest, bounded by a respawn counter. `node --watch` re-execs the
// server on any watched-source write, so a merge, a manual restart or a gate fixture plant used to kill a
// multi-hour backfill outright (three such kills in one day). The rows it DOES reap keep the restart-class
// attribution (#560) — the reclaim stamps them through the same shared reap sentences the steady-state sweep
// uses, so a boot death never reads as a stale heartbeat.

import type { Db } from "@orb/db";
import { reclaimChatLocksOnBoot } from "#domain/chat";
import type { WorkloadContributions } from "#domain/workloads";
import { reclaimInFlightOnBoot } from "#domain/workloads";
import { getLog } from "#foundation/observability";

export interface ReclaimLocksDeps {
  readonly db: Db;
  /** The contribution registry the row read path validates params against (poison tolerance), and the
   *  reclaim reads each kind's declared `resume` policy from. */
  readonly contributions: WorkloadContributions;
  readonly now: () => number;
  /** This replica's stable lock-holder tag — MUST match the tag chat acquires turn-locks under. */
  readonly holder: string;
}

/** Dispose of orphaned in-flight workloads (re-queue the resumable, reap the rest) + reclaim this replica's
 *  orphaned chat turn-locks. Returns the TOTAL number of rows/locks moved; the per-disposition breakdown is
 *  in the log line, because "N reclaimed" is what made a lost multi-hour backfill read as boot noise. */
export async function reclaimLocksOnBoot(deps: ReclaimLocksDeps): Promise<number> {
  const workloads = await reclaimInFlightOnBoot({ db: deps.db, contributions: deps.contributions, now: deps.now() });
  const chatLocks = await reclaimChatLocksOnBoot(deps.db, deps.holder);
  getLog().info(
    { requeued: workloads.requeued, reaped: workloads.reaped, chatLocks },
    "boot/reclaim-locks: re-queued resumable in-flight workloads, reaped the rest, reclaimed chat turn-locks",
  );
  return workloads.requeued + workloads.reaped + chatLocks;
}
