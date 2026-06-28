// domain/stats — COMPOSITION ROOT: wires the 12 read verbs over the DI bundle (zero logic). The tRPC
// `stats.*` router's single delegation target, with `ownerId = principal.userId` (never input — §7.1). The
// rollups are maintained LIVE on the write path (write/apply-delta.ts, injected into chat); the full
// rebuild (write/rebuild-from-canon.ts) is the reconcile-stats workload — neither is a verb here.

import type { Db } from "@orb/db";
import { createStatsContext } from "./context";
import type { StatsService } from "./contract/service";
import { createActivityHeatmap } from "./verbs/activity-heatmap";
import { createByModel } from "./verbs/by-model";
import { createCharacter } from "./verbs/character";
import { createFreshness } from "./verbs/freshness";
import { createLatency } from "./verbs/latency";
import { createLeaderboard } from "./verbs/leaderboard";
import { createMomentum } from "./verbs/momentum";
import { createOverview } from "./verbs/overview";
import { createPersonaUsage } from "./verbs/persona-usage";
import { createTemporal } from "./verbs/temporal";
import { createTimeseries } from "./verbs/timeseries";
import { createWrapped } from "./verbs/wrapped";

export function createStatsService(db: Db): StatsService {
  const ctx = createStatsContext(db);
  return {
    ...createOverview(ctx),
    ...createCharacter(ctx),
    ...createLeaderboard(ctx),
    ...createTimeseries(ctx),
    ...createByModel(ctx),
    ...createFreshness(ctx),
    ...createPersonaUsage(ctx),
    ...createWrapped(ctx),
    ...createTemporal(ctx),
    ...createActivityHeatmap(ctx),
    ...createMomentum(ctx),
    ...createLatency(ctx),
  };
}
