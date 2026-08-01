// verb: reconcile — rebuild THIS caller's rollups from canon, awaited, in-request. The direct twin of the
// `reconcile-stats` workload's singular arm (owner ruling on the junk-drawer report §6 Q4): the queue keeps
// the ALL-OWNERS bulk sweep (single-active lock + run history), while a user asking "recompute my stats"
// gets an answer in the same request instead of a queued row to babysit.
//
// The op has ONE home either way — `write/rebuild-from-canon.reconcileStats` — and this path was already
// proven in production: the import post-settle calls the very same function awaited.
//
// SCOPE: `ownerId` is the resolved `Principal.userId` at the router (never client input), so a caller can
// only ever rebuild its own rollups; owner enumeration inside the rebuild is membership-derived from the
// owner's characters.
//
// SINGLE-FLIGHT (owner ruling 2026-08-02): a caller with a rebuild in flight is REFUSED (CONFLICT) rather
// than starting a second full pass over the same rollup rows — there is no cancel on this path, so the
// honest answer to a second click is "wait for the running one". The gate is the in-memory per-user
// registry built once per service; WHY in-memory is sanctioned lives in `../reconcile-in-flight.ts`.

import type { UserId } from "@orb/kit/ids";
import type { ReconcileInFlight } from "../contract/reconcile-in-flight";
import type { ReconcileStatsResult } from "../contract/results";
import type { StatsContext, StatsService } from "../contract/service";
import { reconcileOwnerStats } from "../substrate/reconcile-owner";

export function createReconcile(ctx: StatsContext, inFlight: ReconcileInFlight): Pick<StatsService, "reconcile"> {
  async function reconcile(ownerId: UserId): Promise<ReconcileStatsResult> {
    return await inFlight.run(ownerId, () => reconcileOwnerStats(ctx.db, { ownerId, now: ctx.now }));
  }
  return { reconcile };
}
