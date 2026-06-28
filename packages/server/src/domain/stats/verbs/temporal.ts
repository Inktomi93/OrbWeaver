import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service";
import type { TemporalStats } from "../contract/views";
import { readTemporal } from "../persistence/rollups";

// temporal — streaks / active days / busiest day / day-of-week, derived from daily_stats.

export function createTemporal(ctx: StatsContext): Pick<StatsService, "temporal"> {
  async function temporal(ownerId: UserId): Promise<TemporalStats> {
    return await readTemporal(ctx.db, ownerId);
  }
  return { temporal };
}
