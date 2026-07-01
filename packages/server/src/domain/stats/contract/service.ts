// domain/stats/contract/service — the typed API surface (core/Core-0-Architecture-and-Structure.md §4). `StatsService` is the
// authoritative verb listing (read it to know everything the read side does); `StatsContext` is the
// explicit DI bundle (the inferred `ReturnType<>` is invisible at a glance, so it's hand-written here per
// §7.4 + the no-inline-types gate — matches the sessions/admin precedent of homing the context interface
// in contract/service.ts).
//
// READ-ONLY: the rollups (db/schema/stats.ts) are maintained LIVE on the chat write-path
// (`applyStatsDelta`, write/apply-delta.ts); the full rebuild is `reconcileStats` (write/rebuild-from-
// canon.ts), driven by the admin `reconcile-stats` workload. NEITHER write path is a verb here — they're
// the standalone write substrate exported via the front door, not the read service.
//
// `ownerId` is ALWAYS `principal.userId` (never input) — the single-owner row-scoping invariant across
// every verb (§7.1). Verbs return data or `null`/empty for an absent rollup — stats has NO typed error
// (documented choice; there is no contract/errors.ts).

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ByModelOpts, LatencyScope, LeaderboardOpts, TimeseriesOpts } from "./params";
import type {
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
} from "./views";

/** The DI bundle every verb closes over, wired at the composition root (`service.ts`). Stats is read-only,
 *  so the bundle is just the libSQL handle — all queries route through `persistence/`. Explicit interface
 *  (not `ReturnType<typeof createStatsContext>`) per §7.4 + the no-context-returntype gate. */
export interface StatsContext {
  db: Db;
}

export interface StatsService {
  /** Owner-grain totals from the live `owner_stats` rollup (the dashboard hero), with TTFT/gen latency
   *  percentiles computed on-read. `null` when the owner has no rollup row yet. */
  overview: (ownerId: UserId) => Promise<OwnerStatsView | null>;
  /** Single-character rollup (one row per character, D28), with on-read latency scoped to that character.
   *  `null` when there is no rollup for this owned character. */
  character: (ownerId: UserId, characterId: CharacterId) => Promise<CharacterStatsView | null>;
  /** Per-character leaderboard rows. Sort defaults to `assistantTurns` (desc); limit defaults to 50,
   *  capped at 200. Scoped to the owner's characters (character_stats has no ownerId — D23). */
  leaderboard: (ownerId: UserId, opts?: LeaderboardOpts) => Promise<LeaderboardRow[]>;
  /** Daily-bucketed activity points from `daily_stats`, ascending by day, over an optional inclusive
   *  [from, to] window (YYYY-MM-DD; both ends optional). */
  timeseries: (ownerId: UserId, opts?: TimeseriesOpts) => Promise<DailyPoint[]>;
  /** Per-(model, provider) usage rows from `model_stats`, ordered by generation count (desc), with on-read
   *  latency + distinct-character "reach" merged in. Limit defaults to 50, capped at 200. */
  byModel: (ownerId: UserId, opts?: ByModelOpts) => Promise<ModelStatRow[]>;
  /** Rollup freshness for the empty-state gate: `computedAt` (epoch-ms) + `hasData`. `stale` is always
   *  false post-Stage-3 (rollups are maintained live, never stale). */
  freshness: (ownerId: UserId) => Promise<StatsFreshness>;
  /** Per-persona usage (live — a cheap chat-level GROUP BY, always fresh, not rolled up). */
  personaUsage: (ownerId: UserId) => Promise<PersonaUsageRow[]>;
  /** The shareable "your RP in numbers" headline. `null` until the rollup has run. */
  wrapped: (ownerId: UserId) => Promise<WrappedSummary | null>;
  /** Streaks / active days / busiest day / day-of-week (derived from `daily_stats`). */
  temporal: (ownerId: UserId) => Promise<TemporalStats>;
  /** Day-of-week × hour-of-day message heatmap (on-read canon scan — `daily_stats` has no hour axis). */
  activityHeatmap: (ownerId: UserId) => Promise<ActivityHeatmap>;
  /** Per-character attention shift between the two most-recent active months (rising / falling). */
  momentum: (ownerId: UserId, limit?: number) => Promise<CharacterMomentum>;
  /** On-read TTFT/gen latency percentiles for the entity in view (owner / character / model). The stored
   *  rollups carry no percentiles (they can't be `+=`-maintained — invariant #6). */
  latency: (ownerId: UserId, scope: LatencyScope) => Promise<LatencyStats>;
}
