import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { WrappedSummary } from "../contract/views.ts";
import { readWrapped } from "../persistence/rollups.ts";

// wrapped — the shareable "your RP in numbers" headline (owner rollup + leaderboard top + temporal).
// `null` until the rollup has run.

export function createWrapped(ctx: StatsContext): Pick<StatsService, "wrapped"> {
  async function wrapped(ownerId: UserId): Promise<WrappedSummary | null> {
    return await readWrapped(ctx.db, ownerId);
  }
  return { wrapped };
}
