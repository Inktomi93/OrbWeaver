// Boot step: rebuild the stats timeline for every owner whose `daily_stats` rows a re-grain migration
// dropped. Only canon can re-derive them, so a migration cannot convert them in SQL; this runs the rebuild
// before the first Insights read. Idempotent by its predicate: a no-op on every boot after the first.

import type { Db } from "@orb/db";
import { reconcileOwnersMissingTimeline } from "#domain/stats";
import { getLog } from "#foundation/observability";

export interface RebuildStatsTimelineDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** Rebuild the rollups of every owner with recorded activity and an empty timeline. Returns the owners rebuilt. */
export async function rebuildStatsTimelineOnBoot(deps: RebuildStatsTimelineDeps): Promise<number> {
  const rebuilt = await reconcileOwnersMissingTimeline(deps.db, deps.now);
  if (rebuilt > 0) {
    getLog().info({ rebuilt }, "boot/rebuild-stats-timeline: rebuilt the stats rollups of owners with an empty timeline");
  }
  return rebuilt;
}
