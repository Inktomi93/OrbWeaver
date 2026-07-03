// domain/stats/contract/views — every wire shape the stats read service returns (the §7.4 one-home for
// the stats view types). These are READ-MODEL shapes: thin projections of the four rollup tables
// (db/schema/stats.ts) plus the read-layer-derived rates (substrate/rates.ts) and the on-read TTFT/gen
// percentiles (substrate/percentiles.ts via persistence/latency.ts). NO percentile is ever a stored
// column (invariant #6) — the `*GenMs`/`*TtftMs` fields are computed on read and spread in here.

import type { CharacterId } from "@orb/kit/ids";

// Behavior / cost / efficiency fields + read-layer-derived rates. Shared by the owner + character views.
export interface ExtraStats {
  reasoningMs: number; // thinking time (sum of metadata.reasoning_duration)
  costUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  forkedChats: number;
  variantMessages: number; // replies that got re-rolled at least once
  maxContextTokens: number | null;
  // derived (substrate/rates.ts)
  throughputTps: number; // tokens/sec across all generations
  avgSwipeDepth: number; // avg settled swipe index (how deep you re-roll)
  swipeRate: number; // fraction of replies re-rolled
  cacheHitRate: number; // cacheRead / (read + write)
  avgReplyWords: number; // assistant words per reply
}

export interface OwnerStatsView extends ExtraStats {
  characters: number;
  chats: number;
  userTurns: number;
  assistantTurns: number;
  systemTurns: number;
  swipes: number;
  userWords: number;
  assistantWords: number;
  swipeWords: number;
  tokensIn: number;
  tokensOut: number;
  totalGenTimeMs: number;
  avgGenMs: number | null;
  p50GenMs: number | null;
  p90GenMs: number | null;
  avgTtftMs: number | null;
  p50TtftMs: number | null;
  p90TtftMs: number | null;
  reasoningRate: number;
  contentBytes: number;
  firstChatAt: number | null;
  lastActivityAt: number | null;
  computedAt: number;
}

export interface CharacterStatsView extends OwnerStatsView {
  characterId: CharacterId;
  name: string;
}

export interface LeaderboardRow {
  characterId: CharacterId;
  name: string;
  chats: number;
  userTurns: number;
  assistantTurns: number;
  swipes: number;
  tokensOut: number;
  totalGenTimeMs: number;
  reasoningRate: number;
  firstChatAt: number | null;
  lastActivityAt: number | null;
}

export interface DailyPoint {
  day: string;
  chatsCreated: number;
  userTurns: number;
  assistantTurns: number;
  swipes: number;
  tokensIn: number;
  tokensOut: number;
  genTimeMs: number;
  messageDatesApprox: boolean;
}

export interface ModelStatRow {
  model: string;
  provider: string | null;
  generations: number;
  /** Distinct characters this model has generated for — the model's "reach" across the cast. The
   *  model_stats rollup is character-less, so this is a small owner-scoped GROUP BY over canon. */
  charactersUsedWith: number;
  tokensIn: number;
  tokensOut: number;
  totalGenTimeMs: number;
  avgGenMs: number | null;
  avgTtftMs: number | null;
  p50TtftMs: number | null;
  p90TtftMs: number | null;
  reasoningRate: number;
  throughputTps: number;
  costUsd: number;
  reasoningMs: number;
  cacheHitRate: number;
}

export interface StatsFreshness {
  /** Epoch-ms the rollup was last touched (latest write-path delta or reconcile). null = no data. */
  computedAt: number | null;
  /** Always false since the Stage-3 pivot: the rollups are maintained LIVE on the write path, so a read
   *  is never stale. Kept on the shape so the client's freshness gate stays a no-op rather than a removed
   *  field (the manual-recompute affordance is gone — freshness is passive). */
  stale: boolean;
  /** Whether any rollup row exists for the owner (drives "no data yet" empty state vs the dashboard). */
  hasData: boolean;
}

export interface PersonaUsageRow {
  personaId: string;
  name: string;
  chatCount: number;
  messageCount: number;
  tokensOut: number;
  lastUsedAt: number | null; // epoch-ms UTC
}

export interface TemporalStats {
  activeDays: number;
  longestStreakDays: number;
  busiestDay: { day: string; count: number } | null;
  /** Activity by weekday, Sun..Sat (index 0 = Sunday). */
  dayOfWeek: number[];
}

export interface WrappedSummary {
  firstChatAt: number | null;
  lastActivityAt: number | null;
  characters: number;
  chats: number;
  words: number; // user + assistant
  replies: number;
  swipes: number;
  genTimeMs: number;
  reasoningMs: number;
  costUsd: number;
  avgSwipeDepth: number;
  swipeRate: number;
  throughputTps: number;
  forkedChats: number;
  topCharacter: { name: string; assistantTurns: number } | null;
  temporal: TemporalStats;
  computedAt: number;
}

// ── Activity heatmap (day-of-week × hour-of-day) ──────────────────────────────────────────────────
export interface ActivityHeatmap {
  /** 7 rows (0 = Sunday … 6 = Saturday) × 24 cols (UTC hour). cell = messages exchanged that slot. */
  matrix: number[][];
  /** Total messages counted (user + assistant). */
  total: number;
  /** The single busiest slot, or null when there's no activity. */
  peak: { dayOfWeek: number; hour: number; count: number } | null;
}

// ── Character momentum (rising / falling vs the prior active month) ───────────────────────────────
export interface MomentumRow {
  characterId: CharacterId;
  name: string;
  /** Assistant turns in the latest active month. */
  current: number;
  /** Assistant turns in the month before it. */
  prev: number;
  /** current − prev (the momentum). */
  delta: number;
}

export interface CharacterMomentum {
  /** The two most recent calendar months WITH any activity (YYYY-MM), or null if fewer than two. */
  latestMonth: string | null;
  prevMonth: string | null;
  /** Characters gaining attention (`delta > 0`), strongest first. */
  rising: MomentumRow[];
  /** Characters cooling off (`delta < 0`), steepest drop first. */
  falling: MomentumRow[];
}

export interface LatencyStats {
  avgTtftMs: number | null;
  p50TtftMs: number | null;
  p90TtftMs: number | null;
  avgGenMs: number | null;
  p50GenMs: number | null;
  p90GenMs: number | null;
}
