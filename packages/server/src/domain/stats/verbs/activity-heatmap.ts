import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service";
import type { ActivityHeatmap } from "../contract/views";
import { readActivityHeatmap } from "../persistence/activity";

// activityHeatmap — day-of-week × hour-of-day message heatmap (on-read canon scan — daily_stats has no
// hour axis). Counts user + assistant turns in the owner's chats (membership-scoped — D18).

export function createActivityHeatmap(ctx: StatsContext): Pick<StatsService, "activityHeatmap"> {
  async function activityHeatmap(ownerId: UserId): Promise<ActivityHeatmap> {
    return await readActivityHeatmap(ctx.db, ownerId);
  }
  return { activityHeatmap };
}
