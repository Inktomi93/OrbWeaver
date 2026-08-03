// domain/stats — FRONT DOOR: the only legal external import. Re-exports the read service + factory + view
// types, plus the two standalone WRITE fns (applyStatsDelta — injected into chat; reconcileStats — the
// reconcile-stats workload). The wire types `StatsDelta`/`ApplyStatsDelta` are NOT re-homed here — they
// live in `@orb/contracts/stats`; the pure primitives `wordCount`/`utcDay`/`modelKey` in
// `@orb/kit/stats-tally`; chat + the composition root import those from there directly (no double-homing).

export type { LatencyScope, LeaderboardSort } from "./contract/params.ts";
// Params — the type axes + their runtime sources (the tuple/schema a thin tRPC router derives its wire
// input from; deep-importing contract/params is a front-door violation, so they re-export here).
export { LEADERBOARD_SORTS, latencyScopeSchema } from "./contract/params.ts";
export type { ReconcileStatsResult } from "./contract/results.ts";
export type { StatsService, StatsWorkloadDeps } from "./contract/service.ts";
export type {
  ActivityHeatmap,
  CharacterMomentum,
  CharacterStatsView,
  DailyPoint,
  LatencyStats,
  LeaderboardRow,
  ModelStatRow,
  OwnerStatsView,
  PersonaUsageRow,
  StatsFreshness,
  TemporalStats,
  WrappedSummary,
} from "./contract/views.ts";
export { createStatsService } from "./service.ts";
export { createStatsWorkloadContributions } from "./workload-contributions.ts";
export { applyStatsDelta } from "./write/apply-delta.ts";
export { reconcileStats } from "./write/rebuild-from-canon.ts";
