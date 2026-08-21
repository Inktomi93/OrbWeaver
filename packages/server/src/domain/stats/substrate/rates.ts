// domain/stats/substrate/rates — pure read-layer rate math (zero I/O). Rollup columns stay additively
// mergeable; the ratios a dashboard wants are not additive, so they're derived here on read, never stored.
//
// PROVENANCE IS PART OF THE MATH (side-eye rail-analytics 2026-08-19, P1a/P2a). The rollup columns are
// NOT NULL integers that start at 0, so "never recorded" and "measured zero" arrive here as the same
// byte. A rate or a total that cannot tell those apart PRINTS A FALSEHOOD — the measured case was
// `Cache hits 100%` on a corpus whose true cache share was 1.9%, and `0 tok` / `$0.00` on ST-imported
// and agent-sdk turns that never carried accounting at all. The `*OrNull` helpers below are therefore
// the ONE place the distinction is decided; `null` means UNRECORDED and every read surface renders it
// as an em dash, exactly as the latency percentiles already do (they were nullable from the start —
// this extends that precedent to counts, costs and rates).

import type { TokenProvenance } from "@orb/contracts/chat";
import type { ExtraStats } from "../contract/views.ts";

/** 0 when the denominator is non-positive (avoids NaN/Infinity from an empty rollup).
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function div(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function reasoningRate(reasoningGenerations: number, gens: number): number {
  return div(reasoningGenerations, gens);
}

const MS_PER_SEC = 1000;

export function throughputTps(tokensOut: number, genTimeMs: number): number {
  return div(tokensOut, genTimeMs / MS_PER_SEC);
}

/** The share of INPUT tokens that were served from the provider's prompt cache — `null` when this rollup
 *  carries no cache accounting at all.
 *
 *  The denominator is `tokensIn` and not `cacheRead + cacheWrite`: only Anthropic reports cache-WRITE
 *  tokens, so the old ratio collapsed to exactly 1.0 for every other backend (a positive read with a zero write) and to
 *  exactly 0.0 for a backend that reports neither — a CONSTANT wearing a percentage's clothes. Against
 *  `tokensIn` the figure answers the question the label asks ("how much of what I sent was cached?") for
 *  every backend identically. `null` when the row has neither cache column populated (nothing to report)
 *  or no input tokens recorded (no denominator) — `character_stats` has no cache columns at all, so every
 *  per-character read lands here. */
export function cacheHitRate(cacheReadTokens: number, cacheWriteTokens: number, tokensIn: number): number | null {
  if (cacheReadTokens + cacheWriteTokens <= 0 || tokensIn <= 0) {
    return null;
  }
  return div(cacheReadTokens, tokensIn);
}

/** Aggregate provenance is reversible from the two sample counters: estimates dominate a mixed total,
 *  measured wins only when no estimate exists, and no samples remains honestly unrecorded. */
export function aggregateTokenProvenance(measuredSamples: number, estimatedSamples: number): TokenProvenance {
  if (estimatedSamples > 0) {
    return "estimated";
  }
  return measuredSamples > 0 ? "measured" : "unrecorded";
}

export function recordedTokens(tokens: number, measuredSamples: number, estimatedSamples: number): number | null {
  return aggregateTokenProvenance(measuredSamples, estimatedSamples) === "unrecorded" ? null : tokens;
}

/** A USD total, or `null` when no contributing row reported cost. A zero cost with a sample is a perfectly
 *  ordinary measured value (for example a local model); no sample is absence, not `$0.00`. */
export function recordedCost(costUsd: number, costSamples: number): number | null {
  return costSamples > 0 ? costUsd : null;
}

/** Shared by owner + character views (character_stats has no cache/context columns — caller passes 0/null). */
export function deriveExtra(r: {
  reasoningMs: number;
  costUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  forkedChats: number;
  variantMessages: number;
  maxContextTokens: number | null;
  tokensIn: number;
  tokensOut: number;
  costSamples: number;
  totalGenTimeMs: number;
  activeIdxSum: number;
  assistantTurns: number;
  assistantWords: number;
  swipes: number;
}): ExtraStats {
  return {
    reasoningMs: r.reasoningMs,
    costUsd: recordedCost(r.costUsd, r.costSamples),
    cacheReadTokens: r.cacheReadTokens,
    cacheWriteTokens: r.cacheWriteTokens,
    forkedChats: r.forkedChats,
    variantMessages: r.variantMessages,
    maxContextTokens: r.maxContextTokens,
    throughputTps: throughputTps(r.tokensOut, r.totalGenTimeMs),
    avgSwipeDepth: div(r.activeIdxSum, r.variantMessages),
    swipeRate: div(r.variantMessages, r.assistantTurns),
    cacheHitRate: cacheHitRate(r.cacheReadTokens, r.cacheWriteTokens, r.tokensIn),
    avgReplyWords: div(r.assistantWords, r.assistantTurns),
  };
}
