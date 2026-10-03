// The typed API surface: `StatsService` is the authoritative verb listing, `StatsContext` the DI bundle.
// Read-first: the rollups are maintained live on the chat write-path (`applyStatsDelta`, injected into chat —
// NOT a verb here). The ONE write verb is `reconcile`: the caller-scoped, awaited rebuild-from-canon, the
// direct twin of the `reconcile-stats` workload's singular arm (the all-owners BULK sweep stays on the queue,
// which is what the single-active lock + run history are for).
// `ownerId` is always `principal.userId`. Verbs return data or `null`/empty for an absent rollup — no typed
// error.

import type { CharacterEconomics, CharacterModelEconomics } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { ByModelOpts, LatencyScope, LeaderboardOpts, PersonaUsageOpts, TimeseriesOpts } from "./params.ts";
import type { ReconcileStatsResult } from "./results.ts";
import type {
  ActivityBucket,
  CharacterStatsView,
  LatencyStats,
  LeaderboardPage,
  ModelStatRow,
  MomentumBucket,
  OwnerStatsView,
  PersonaUsageRow,
  StatsFreshness,
  WrappedSummary,
} from "./views.ts";

/** The DI bundle every verb closes over: the libSQL handle + the injected clock the rebuild stamps with. */
export interface StatsContext {
  db: Db;
  now: () => number;
}

export interface StatsService {
  /** Owner-grain totals from the live `owner_stats` rollup (the dashboard hero), with TTFT/gen latency
   *  percentiles computed on-read. `null` when the owner has no rollup row yet. */
  overview: (ownerId: UserId) => Promise<OwnerStatsView | null>;
  /** Single-character rollup (one row per character, D28), with on-read latency scoped to that character.
   *  `null` when there is no rollup for this owned character. */
  character: (ownerId: UserId, characterId: CharacterId) => Promise<CharacterStatsView | null>;
  /** Per-character leaderboard PAGE — the capped `rows` plus the uncapped ranked `total` they were cut
   *  from. Sort defaults to `assistantTurns` (desc); limit defaults to 50, capped at 200. Scoped to the
   *  owner's characters (character_stats has no ownerId — D23). */
  leaderboard: (ownerId: UserId, opts?: LeaderboardOpts) => Promise<LeaderboardPage>;
  /** The owner's activity timeline from `daily_stats`: one point per UTC quarter-hour bucket, ascending,
   *  over an optional inclusive [from, to] window of bucket starts (epoch-ms; both ends optional). Every
   *  day-, weekday- and hour-grained Insights chart is folded from this in the viewer's zone, client-side. */
  timeseries: (ownerId: UserId, opts?: TimeseriesOpts) => Promise<ActivityBucket[]>;
  /** Per-(model, provider) usage rows from `model_stats`, ordered by generation count (desc), with on-read
   *  latency + distinct-character "reach" merged in. Limit defaults to 50, capped at 200. */
  byModel: (ownerId: UserId, opts?: ByModelOpts) => Promise<ModelStatRow[]>;
  /** Rollup freshness for the empty-state gate: `computedAt` (epoch-ms) + `hasData`. `stale` is always
   *  false post-Stage-3 (rollups are maintained live, never stale). */
  freshness: (ownerId: UserId) => Promise<StatsFreshness>;
  /** Per-persona usage (live — a cheap chat-level GROUP BY, always fresh, not rolled up). `opts.characterId`
   *  narrows the chat set to that character's chats (the analytics CONTEXT drill); ownership is always
   *  `personas.owner_id`, so the narrow is a projection, never an access decision. */
  personaUsage: (ownerId: UserId, opts?: PersonaUsageOpts) => Promise<PersonaUsageRow[]>;
  /** The shareable "your RP in numbers" headline. `null` until the rollup has run. */
  wrapped: (ownerId: UserId) => Promise<WrappedSummary | null>;
  /** Per-character attention shift between the two most-recent active months (rising / falling). */
  momentum: (ownerId: UserId) => Promise<MomentumBucket[]>;
  /** On-read TTFT/gen latency percentiles for the entity in view (owner / character / model). The stored
   *  rollups carry no percentiles (they can't be `+=`-maintained — invariant #6). */
  latency: (ownerId: UserId, scope: LatencyScope) => Promise<LatencyStats>;

  /** Per-character selected-variant economics, owner-scoped — discovery's `forgottenGems` composes this
   *  for the cost/usage dimension. */
  characterEconomics: (ownerId: UserId) => Promise<CharacterEconomics[]>;
  /** Per-(character, model) selected-variant economics, owner-scoped — discovery's `modelRouting` re-groups
   *  by the character's distilled genre. */
  characterModelEconomics: (ownerId: UserId) => Promise<CharacterModelEconomics[]>;

  /** Rebuild THIS owner's rollups from canon, awaited (the instant "recompute my stats"). The bulk
   *  all-owners sweep stays the `reconcile-stats` workload. */
  reconcile: (ownerId: UserId) => Promise<ReconcileStatsResult>;
}

/** What the domain's `WorkloadContribution` factory needs from the composition root (`reconcile-stats`). */
export interface StatsWorkloadDeps {
  readonly db: Db;
  readonly now: () => number;
}
