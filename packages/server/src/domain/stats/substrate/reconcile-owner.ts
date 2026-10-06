// domain/stats/substrate/reconcile-owner — the caller-scoped rebuild policy, separate from the workload's
// all-owner sweep. The persistence rebuild is shared; this seam keeps a user's verb from inheriting bulk scope.
//
// It exists to bind ONE scope decision: the caller-scoped rebuild always passes an `ownerId`, which is what
// separates this path from the `reconcile-stats` workload's bulk arm (no `ownerId` ⇒ every owner). The
// underlying rebuild is one home, shared by both.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ReconcileStatsResult } from "../contract/results.ts";
import { reconcileStats } from "../persistence/rebuild-from-canon.ts";

/** Rebuild exactly ONE owner's rollups from canon (never the deployment-wide sweep). */
export async function reconcileOwnerStats(db: Db, args: { ownerId: UserId; now: () => number }): Promise<ReconcileStatsResult> {
  return await reconcileStats(db, { ownerId: args.ownerId, now: args.now });
}
