import type { UserId } from "@orb/kit/ids";
import type { LatencyScope } from "../contract/params";
import type { StatsContext, StatsService } from "../contract/service";
import type { LatencyStats } from "../contract/views";
import { readLatency } from "../persistence/latency";

// latency — on-read TTFT/gen percentiles for the entity in view (owner | character | model). The stored
// rollups carry no percentiles (they can't be `+=`-maintained — invariant #6); this is a bounded canon scan.

export function createLatency(ctx: StatsContext): Pick<StatsService, "latency"> {
  async function latency(ownerId: UserId, scope: LatencyScope): Promise<LatencyStats> {
    return await readLatency(ctx.db, ownerId, scope);
  }
  return { latency };
}
