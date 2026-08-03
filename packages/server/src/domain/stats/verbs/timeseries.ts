import type { UserId } from "@orb/kit/ids";
import type { TimeseriesOpts } from "../contract/params.ts";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { DailyPoint } from "../contract/views.ts";
import { readTimeseries } from "../persistence/rollups.ts";

// timeseries — daily_stats points ascending by day, over an optional inclusive [from, to] YYYY-MM-DD window.

export function createTimeseries(ctx: StatsContext): Pick<StatsService, "timeseries"> {
  async function timeseries(ownerId: UserId, opts?: TimeseriesOpts): Promise<DailyPoint[]> {
    return await readTimeseries(ctx.db, ownerId, opts);
  }
  return { timeseries };
}
