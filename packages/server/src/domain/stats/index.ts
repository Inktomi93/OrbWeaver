// domain/stats — FRONT DOOR: the only legal external import. Re-exports the read service + factory + view
// types, plus the two standalone WRITE fns (applyStatsDelta — injected into chat; reconcileStats — the
// reconcile-stats workload). The wire types `StatsDelta`/`ApplyStatsDelta` are NOT re-homed here — they
// live in `@orb/contracts/stats`; the pure primitives `wordCount`/`utcDay`/`modelKey` in
// `@orb/kit/stats-tally`; chat + the composition root import those from there directly (no double-homing).

export type { LatencyScope, LeaderboardSort } from "./contract/params";
// Params — the type axes + their runtime sources (the tuple/schema a thin tRPC router derives its wire
// input from; deep-importing contract/params is a front-door violation, so they re-export here).
export { LEADERBOARD_SORTS, latencyScopeSchema } from "./contract/params";
export type { ReconcileStatsResult } from "./contract/results";
export type { StatsService, StatsWorkloadDeps } from "./contract/service";
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
} from "./contract/views";
export { createStatsService } from "./service";
export { createStatsWorkloadContributions } from "./workload-contributions";
export { applyStatsDelta } from "./write/apply-delta";
export { reconcileStats } from "./write/rebuild-from-canon";
