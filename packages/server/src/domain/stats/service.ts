// domain/stats — COMPOSITION ROOT: wires the read verbs + the one write verb over the DI bundle (zero
// logic). The tRPC
// `stats.*` router's single delegation target, with `ownerId = principal.userId` (never input — §7.1). The
// rollups are maintained LIVE on the write path (write/apply-delta.ts, injected into chat); the full
// rebuild (write/rebuild-from-canon.ts) is reached BOTH ways: the `reconcile` verb (caller-scoped, awaited)
// and the `reconcile-stats` workload (the all-owners bulk sweep). `applyStatsDelta` is not a verb here.

import type { Db } from "@orb/db";
import { createStatsContext } from "./context";
import type { StatsService } from "./contract/service";
import { createReconcileInFlight } from "./reconcile-in-flight";
import { createActivityHeatmap } from "./verbs/activity-heatmap";
import { createByModel } from "./verbs/by-model";
import { createCharacter } from "./verbs/character";
import { createEconomics } from "./verbs/economics";
import { createFreshness } from "./verbs/freshness";
import { createLatency } from "./verbs/latency";
import { createLeaderboard } from "./verbs/leaderboard";
import { createMomentum } from "./verbs/momentum";
import { createOverview } from "./verbs/overview";
import { createPersonaUsage } from "./verbs/persona-usage";
import { createReconcile } from "./verbs/reconcile";
import { createTemporal } from "./verbs/temporal";
import { createTimeseries } from "./verbs/timeseries";
import { createWrapped } from "./verbs/wrapped";

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
