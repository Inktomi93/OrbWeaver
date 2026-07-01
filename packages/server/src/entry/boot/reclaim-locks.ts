// entry/boot/reclaim-locks — boot step 4: single-replica boot reclaim of stale claims a dead process left
// behind (core/Tier-5-Entry.md §"Boot order" — `reclaimChatLocksOnBoot`).
//
// WORKLOADS (wired): reap every IN-FLIGHT workload row via the workloads front-door `reapOrphanedWorkloads`,
// with a stale threshold of 0 — a boot reclaim is NOT the steady-state poll-loop reaper. Single replica
// means no worker survived the restart, so EVERY in-flight ({running,cancelling}) row is orphaned by
// definition; the steady-state reaper's 15s heartbeat grace (which avoids reaping a live peer) is wrong at
// boot. Reaping frees each wedged kind's single-active slot so the next `start()` can proceed.
//
// CHAT LOCKS (wired): `reclaimChatLocksOnBoot(db, holder)` (chat front door) wipes every `chat_locks` row this
// replica's `holder` orphaned when it last crashed — a single replica means no turn survived the restart, so
// its held locks are stale-by-intent regardless of TTL. The `holder` MUST be the SAME stable tag the chat
// turn-lock acquires under (entry threads `os.hostname()` to both compose's `ServicesDeps.holder` and here) —
// else a fresh random holder would match nothing and reclaim zero. Other replicas' live locks are untouched
// (the holder scope); cross-replica staleness is handled by the TTL steal in `tryAcquireLock`. The `rate_limit`
// buckets are self-expiring (window-based), so they need no boot reclaim (intentionally skipped).
//
// `now` is INJECTED (the reaper takes the instant — determinism); `@orb/db` is imported directly (lower
// package; entry may).

import type { Db } from "@orb/db";
import { reclaimChatLocksOnBoot } from "#domain/chat";
import { reapOrphanedWorkloads } from "#domain/workloads";
import { getLog } from "#foundation/observability";

// A boot reclaim wipes EVERY in-flight row regardless of lease age (see header) — the steady-state grace
// would leave a recently-touched orphan wedging its slot for 15s after restart.
const BOOT_STALE_THRESHOLD_MS = 0;

export interface ReclaimLocksDeps {
  readonly db: Db;
  readonly now: () => number;
  /** This replica's stable lock-holder tag — MUST match the tag chat acquires turn-locks under (compose's
   *  `ServicesDeps.holder`), so a restart reclaims its own orphaned `chat_locks`. */
  readonly holder: string;
}

/**
 * Boot step 4: reap orphaned in-flight workloads (threshold 0 — all in-flight rows are orphaned at the boot
 * of a single replica) AND reclaim this replica's orphaned chat turn-locks. Returns the total count reclaimed.
 */
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
