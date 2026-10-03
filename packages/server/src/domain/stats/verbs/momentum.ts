import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { MomentumBucket } from "../contract/views.ts";
import { readMomentumBuckets } from "../persistence/activity.ts";

// momentum — each character's replies per UTC quarter-hour, from canon (character_stats is cumulative, no
// time axis). The client folds the buckets into the viewer's months and ranks the rising and falling.

export function createMomentum(ctx: StatsContext): Pick<StatsService, "momentum"> {
  async function momentum(ownerId: UserId): Promise<MomentumBucket[]> {
    return await readMomentumBuckets(ctx.db, ownerId);
  }
  return { momentum };
}
