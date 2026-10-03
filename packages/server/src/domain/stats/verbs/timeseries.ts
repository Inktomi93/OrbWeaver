import type { UserId } from "@orb/kit/ids";
import type { TimeseriesOpts } from "../contract/params.ts";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { ActivityBucket } from "../contract/views.ts";
import { readTimeseries } from "../persistence/rollups.ts";

// timeseries — the daily_stats activity timeline, one point per UTC quarter-hour bucket ascending, over an
// optional inclusive [from, to] window of bucket starts (epoch-ms).

export function createTimeseries(ctx: StatsContext): Pick<StatsService, "timeseries"> {
  async function timeseries(ownerId: UserId, opts?: TimeseriesOpts): Promise<ActivityBucket[]> {
    return await readTimeseries(ctx.db, ownerId, opts);
  }
  return { timeseries };
}
