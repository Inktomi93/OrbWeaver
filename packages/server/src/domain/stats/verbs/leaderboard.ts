import type { UserId } from "@orb/kit/ids";
import type { LeaderboardOpts } from "../contract/params.ts";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { LeaderboardPage } from "../contract/views.ts";
import { readLeaderboard } from "../persistence/rollups.ts";

// leaderboard — per-character rows for the owner, sortable (assistantTurns | totalGenTimeMs | swipes |
// lastActivityAt; default assistantTurns desc). limit defaults to 50, capped at 200. Returns a PAGE
// (`rows` + the uncapped ranked `total`) — a caller counting `rows.length` prints the cap, not the census.

export function createLeaderboard(ctx: StatsContext): Pick<StatsService, "leaderboard"> {
  async function leaderboard(ownerId: UserId, opts?: LeaderboardOpts): Promise<LeaderboardPage> {
    return await readLeaderboard(ctx.db, ownerId, opts);
  }
  return { leaderboard };
}
