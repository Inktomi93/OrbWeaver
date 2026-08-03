import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { StatsFreshness } from "../contract/views.ts";
import { readFreshness } from "../persistence/rollups.ts";

// freshness — the empty-state gate: computedAt + hasData. `stale` is ALWAYS false post-Stage-3 (the
// rollups are maintained live on the write path, so a read is never stale).

export function createFreshness(ctx: StatsContext): Pick<StatsService, "freshness"> {
  async function freshness(ownerId: UserId): Promise<StatsFreshness> {
    return await readFreshness(ctx.db, ownerId);
  }
  return { freshness };
}
