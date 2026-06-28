// entry/boot/reclaim-locks — boot step 4: single-replica boot reclaim of stale claims a dead process left
// behind (tiers/entry.md §"Boot order" — `reclaimChatLocksOnBoot`).
//
// WORKLOADS (wired): reap every IN-FLIGHT workload row via the workloads front-door `reapOrphanedWorkloads`,
// with a stale threshold of 0 — a boot reclaim is NOT the steady-state poll-loop reaper. Single replica
// means no worker survived the restart, so EVERY in-flight ({running,cancelling}) row is orphaned by
// definition; the steady-state reaper's 15s heartbeat grace (which avoids reaping a live peer) is wrong at
// boot. Reaping frees each wedged kind's single-active slot so the next `start()` can proceed.
//
// DEFER(promotion): chat-lock reclaim (`reclaimChatLocksOnBoot` over a `chat_locks` table) → entry/boot when
// the chat domain + its lock table land (chat is P5, built last per D16). There is no `chat_locks` table in
// `@orb/db/schema` yet, so there is nothing to reclaim and faking one would invent schema. The `rate_limit`
// buckets are self-expiring (window-based), so they need no boot reclaim (intentionally skipped).
//
// `now` is INJECTED (the reaper takes the instant — determinism); `@orb/db` is imported directly (lower
// package; entry may).

import type { Db } from "@orb/db";
import { reapOrphanedWorkloads } from "#domain/workloads";
import { getLog } from "#foundation/observability";

// A boot reclaim wipes EVERY in-flight row regardless of lease age (see header) — the steady-state grace
// would leave a recently-touched orphan wedging its slot for 15s after restart.
const BOOT_STALE_THRESHOLD_MS = 0;

export interface ReclaimLocksDeps {
  readonly db: Db;
  readonly now: () => number;
}

/**
 * Boot step 4: reap orphaned in-flight workloads (threshold 0 — all in-flight rows are orphaned at the boot
 * of a single replica). Returns the count reaped. The chat-lock reclaim is a documented DEFER (chat is P5).
 */
export async function reclaimLocksOnBoot(deps: ReclaimLocksDeps): Promise<number> {
  const reaped = await reapOrphanedWorkloads({
    db: deps.db,
    now: deps.now(),
    staleThresholdMs: BOOT_STALE_THRESHOLD_MS,
  });
  getLog().info({ reaped }, "boot/reclaim-locks: reaped orphaned in-flight workloads");
  return reaped;
}
