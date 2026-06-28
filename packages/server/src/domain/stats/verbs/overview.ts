import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service";
import type { OwnerStatsView } from "../contract/views";
import { readOverview } from "../persistence/rollups";

// overview — the owner-grain dashboard hero: the live owner_stats rollup + on-read latency. `null` when the
// owner has no rollup row yet. ownerId is the caller's principal.userId (never input — §7.1).

export function createOverview(ctx: StatsContext): Pick<StatsService, "overview"> {
  async function overview(ownerId: UserId): Promise<OwnerStatsView | null> {
    return await readOverview(ctx.db, ownerId);
  }
  return { overview };
}
