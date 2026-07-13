// domain/stats/contract/views — wire shapes the stats read service returns. Percentiles are never a
// stored column (invariant #6) — the *GenMs/*TtftMs fields are computed on read.

import type { CharacterId, PersonaId } from "@orb/kit/ids";

export interface ExtraStats {
  reasoningMs: number;
  costUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  forkedChats: number;
  variantMessages: number;
  maxContextTokens: number | null;
  throughputTps: number;
  avgSwipeDepth: number;
  swipeRate: number;
  cacheHitRate: number;
  avgReplyWords: number;
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
  /** Distinct characters generated for; model_stats is character-less, so this is a separate GROUP BY. */
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
  computedAt: number | null;
  /** Always false — rollups are maintained live on the write path, so a read is never stale. */
  stale: boolean;
  hasData: boolean;
}

export interface PersonaUsageRow {
  personaId: PersonaId;
  name: string;
  chatCount: number;
  messageCount: number;
  tokensOut: number;
  lastUsedAt: number | null;
}

export interface TemporalStats {
  activeDays: number;
  longestStreakDays: number;
  busiestDay: { day: string; count: number } | null;
  /** Sun..Sat, index 0 = Sunday. */
  dayOfWeek: number[];
}

export interface WrappedSummary {
  firstChatAt: number | null;
  lastActivityAt: number | null;
  characters: number;
  chats: number;
  words: number;
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

export interface ActivityHeatmap {
  /** 7 rows (0 = Sunday … 6 = Saturday) × 24 cols (UTC hour). */
  matrix: number[][];
  total: number;
  peak: { dayOfWeek: number; hour: number; count: number } | null;
}

export interface MomentumRow {
  characterId: CharacterId;
  name: string;
  current: number;
  prev: number;
  delta: number;
}

export interface CharacterMomentum {
  /** Most recent calendar months with activity (YYYY-MM), or null if fewer than two. */
  latestMonth: string | null;
  prevMonth: string | null;
  rising: MomentumRow[];
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
