// Boot step: single-replica reclaim of stale claims a dead process left behind. Single replica means no
// worker survived the restart, so EVERY in-flight row/held lock is orphaned by definition — the
// steady-state reaper's heartbeat grace is wrong here. rate_limit buckets are self-expiring, skipped.

import type { Db } from "@orb/db";
import { reclaimChatLocksOnBoot } from "#domain/chat";
import { reapOrphanedWorkloads } from "#domain/workloads";
import { getLog } from "#foundation/observability";

const BOOT_STALE_THRESHOLD_MS = 0;

export interface ReclaimLocksDeps {
  readonly db: Db;
  readonly now: () => number;
  /** This replica's stable lock-holder tag — MUST match the tag chat acquires turn-locks under. */
  readonly holder: string;
}

/** Reap orphaned in-flight workloads + reclaim this replica's orphaned chat turn-locks. */
export async function reclaimLocksOnBoot(deps: ReclaimLocksDeps): Promise<number> {
  const reaped = await reapOrphanedWorkloads({
    db: deps.db,
    now: deps.now(),
    staleThresholdMs: BOOT_STALE_THRESHOLD_MS,
  });
  const chatLocks = await reclaimChatLocksOnBoot(deps.db, deps.holder);
  getLog().info(
    { reaped, chatLocks },
    "boot/reclaim-locks: reaped orphaned in-flight workloads + chat turn-locks",
  );
  return reaped + chatLocks;
}
