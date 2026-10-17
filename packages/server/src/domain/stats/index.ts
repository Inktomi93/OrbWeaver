// domain/stats — FRONT DOOR: the only legal external import. Re-exports the read service + factory + view
// types, plus the two standalone WRITE fns (applyStatsDelta — injected into chat; reconcileStats — the
// reconcile-stats workload). The wire types `StatsDelta`/`ApplyStatsDelta` are NOT re-homed here — they
// live in `@orb/contracts/stats`; the pure primitives `wordCount`/`statsBucketStart`/`modelKey` in
// `@orb/kit/stats-tally`; chat + the composition root import those from there directly (no double-homing).

export type { ReconcileStatsResult } from "./contract/results.ts";
export type { StatsService, StatsWorkloadDeps } from "./contract/service.ts";
export type {
  ActivityBucket,
  CharacterStatsView,
  LatencyStats,
  LeaderboardPage,
  LeaderboardRow,
  ModelStatRow,
  MomentumBucket,
  OwnerStatsView,
  PersonaUsageRow,
  StatsFreshness,
  WrappedSummary,
} from "./contract/views.ts";
export type { StatsBatchWiring } from "./contract/wiring.ts";
export { reconcileOwnersMissingTimeline } from "./persistence/rebuild-from-canon.ts";
export { createResolveRetainedChatAccountingScope, createResolveRetainedChatRebase, settleRetainedChatRebase } from "./persistence/retained-chat-accounting.ts";
export { createStatsService } from "./service.ts";
export { createStatsWorkloadContributions } from "./workload-contributions.ts";
export { applyCharacterStatsDelta, applyStatsDelta, bumpStatsCanonVersion } from "./write/apply-delta.ts";
export { createStatsBatchWiring, reconcileStats } from "./write/wiring.ts";
