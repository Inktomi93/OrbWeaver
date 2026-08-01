// domain/stats/substrate/reconcile-owner — the ONE seam between a stats VERB and the `write/` subsystem
// (`backfill.ts` precedent in domain/chat): a verb reaches a named subsystem only through `substrate/`, so
// the dependency stays visible at the composition root and the subsystem stays refactor-safe.
//
// It exists to bind ONE scope decision: the caller-scoped rebuild always passes an `ownerId`, which is what
// separates this path from the `reconcile-stats` workload's bulk arm (no `ownerId` ⇒ every owner). The
// underlying rebuild is one home, shared by both.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { ReconcileStatsResult } from "../contract/results";
import { reconcileStats } from "../write/rebuild-from-canon";

/** Rebuild exactly ONE owner's rollups from canon (never the deployment-wide sweep). */
export async function reconcileOwnerStats(db: Db, args: { ownerId: UserId; now: () => number }): Promise<ReconcileStatsResult> {
  return await reconcileStats(db, { ownerId: args.ownerId, now: args.now });
}
