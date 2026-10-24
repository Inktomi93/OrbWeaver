// Boot step: rebuild the `daily_stats` timeline, and nothing else, for every owner whose rows a re-grain
// migration dropped. Only canon can re-derive them, so a migration cannot convert them in SQL; this runs the
// rebuild before the first Insights read. Idempotent by its predicate: a no-op on every boot after the first.

import type { BootDatabaseHandle } from "@orb/db/wiring";
import type { IdSource } from "@orb/kit/ids";
import { reconcileOwnersMissingTimeline } from "#domain/stats";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";

export interface RebuildStatsTimelineDeps {
  readonly logger: Logger;
  readonly db: BootDatabaseHandle;
  readonly now: () => number;
  readonly idSource: IdSource;
}

/** Rebuild the rollups of every owner with recorded activity and an empty timeline. Returns the owners rebuilt. */
export async function rebuildStatsTimelineOnBoot(deps: RebuildStatsTimelineDeps): Promise<number> {
  // Logged on both ends: a large library rebuilds before the listener binds, and silence there reads as a stall.
  const startedAt = deps.now();
  getLog().info("boot/rebuild-stats-timeline: checking for owners with an empty stats timeline");
  const rebuilt = await reconcileOwnersMissingTimeline(deps.db, deps.now, deps.idSource);
  getLog().info({ rebuilt, durationMs: deps.now() - startedAt }, "boot/rebuild-stats-timeline: done");
  return rebuilt;
}
