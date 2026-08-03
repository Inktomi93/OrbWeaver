// domain/stats — COMPOSITION ROOT: wires the read verbs + the one write verb over the DI bundle (zero
// logic). The tRPC
// `stats.*` router's single delegation target, with `ownerId = principal.userId` (never input — §7.1). The
// rollups are maintained LIVE on the write path (write/apply-delta.ts, injected into chat); the full
// rebuild (write/rebuild-from-canon.ts) is reached BOTH ways: the `reconcile` verb (caller-scoped, awaited)
// and the `reconcile-stats` workload (the all-owners bulk sweep). `applyStatsDelta` is not a verb here.

import type { Db } from "@orb/db";
import { createStatsContext } from "./context.ts";
import type { StatsService } from "./contract/service.ts";
import { createReconcileInFlight } from "./reconcile-in-flight.ts";
import { createActivityHeatmap } from "./verbs/activity-heatmap.ts";
import { createByModel } from "./verbs/by-model.ts";
import { createCharacter } from "./verbs/character.ts";
import { createEconomics } from "./verbs/economics.ts";
import { createFreshness } from "./verbs/freshness.ts";
import { createLatency } from "./verbs/latency.ts";
import { createLeaderboard } from "./verbs/leaderboard.ts";
import { createMomentum } from "./verbs/momentum.ts";
import { createOverview } from "./verbs/overview.ts";
import { createPersonaUsage } from "./verbs/persona-usage.ts";
import { createReconcile } from "./verbs/reconcile.ts";
import { createTemporal } from "./verbs/temporal.ts";
import { createTimeseries } from "./verbs/timeseries.ts";
import { createWrapped } from "./verbs/wrapped.ts";

export function createStatsService(db: Db, now: () => number): StatsService {
  const ctx = createStatsContext(db, now);
  // Built HERE, not in the DI bundle: the single-flight registry is process state only `reconcile` reads,
  // and one instance per service is what makes "this user already has a rebuild running" answerable.
  const reconcileInFlight = createReconcileInFlight();
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
    ...createEconomics(ctx),
    ...createReconcile(ctx, reconcileInFlight),
  };
}
