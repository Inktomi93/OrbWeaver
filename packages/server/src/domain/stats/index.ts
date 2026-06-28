// domain/stats — FRONT DOOR: the only legal external import. Re-exports the read service + factory + view
// types, plus the two standalone WRITE fns (applyStatsDelta — injected into chat; reconcileStats — the
// reconcile-stats workload). The wire types `StatsDelta`/`ApplyStatsDelta` are NOT re-homed here — they
// live in `@orb/contracts/stats`; the pure primitives `wordCount`/`utcDay`/`modelKey` in
// `@orb/kit/stats-tally`; chat + the composition root import those from there directly (no double-homing).

// Params
export type { LatencyScope, LeaderboardSort } from "./contract/params";
// Write-substrate result
export type { ReconcileStatsResult } from "./contract/results";
// Read service + factory
export type { StatsService } from "./contract/service";
// View types (what the client receives)
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
// The standalone write substrate (NOT service verbs — injected / workload-driven).
export { applyStatsDelta } from "./write/apply-delta";
export { reconcileStats } from "./write/rebuild-from-canon";
