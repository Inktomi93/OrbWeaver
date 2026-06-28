// domain/stats/substrate/rates — the pure read-layer rate math (zero I/O). The stored rollup columns stay
// additively mergeable (`col += delta`); the RATIOS a dashboard wants (throughput, swipe-rate, cache-hit,
// …) are NOT additive, so they're derived HERE on read from the additive columns, never stored. Substrate,
// not persistence (movement table): pure helpers live in substrate/, out of the query files.

import type { ExtraStats } from "../contract/views";

/** Safe divide — 0 when the denominator is non-positive (avoids NaN/Infinity from an empty rollup). */
export function div(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/** Fraction of generations that carried a reasoning/thinking snapshot. */
export function reasoningRate(reasoningGenerations: number, gens: number): number {
  return div(reasoningGenerations, gens);
}

// Milliseconds per second — gen-time columns are ms, throughput is tokens/sec.
const MS_PER_SEC = 1000;

/** Output tokens per second across all generations (gen-time is ms). */
export function throughputTps(tokensOut: number, genTimeMs: number): number {
  return div(tokensOut, genTimeMs / MS_PER_SEC);
}

/** cacheRead / (cacheRead + cacheWrite) — the prompt-cache hit fraction. */
export function cacheHitRate(cacheReadTokens: number, cacheWriteTokens: number): number {
  return div(cacheReadTokens, cacheReadTokens + cacheWriteTokens);
}

/** Derive the behavior/cost/efficiency `ExtraStats` block (the non-additive rates) from the additive rollup
 *  columns. Shared by the owner + character views (character_stats has no cache/context columns — the
 *  caller passes 0/null there, owner+model grain only, esoteric #5). */
export function deriveExtra(r: {
  reasoningMs: number;
  costUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  forkedChats: number;
  variantMessages: number;
  maxContextTokens: number | null;
  tokensOut: number;
  totalGenTimeMs: number;
  activeIdxSum: number;
  assistantTurns: number;
  assistantWords: number;
}): ExtraStats {
  return {
    reasoningMs: r.reasoningMs,
    costUsd: r.costUsd,
    cacheReadTokens: r.cacheReadTokens,
    cacheWriteTokens: r.cacheWriteTokens,
    forkedChats: r.forkedChats,
    variantMessages: r.variantMessages,
    maxContextTokens: r.maxContextTokens,
    throughputTps: throughputTps(r.tokensOut, r.totalGenTimeMs),
    avgSwipeDepth: div(r.activeIdxSum, r.variantMessages),
    swipeRate: div(r.variantMessages, r.assistantTurns),
    cacheHitRate: cacheHitRate(r.cacheReadTokens, r.cacheWriteTokens),
    avgReplyWords: div(r.assistantWords, r.assistantTurns),
  };
}
