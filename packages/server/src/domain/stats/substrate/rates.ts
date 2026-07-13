// domain/stats/substrate/rates — pure read-layer rate math (zero I/O). Rollup columns stay additively
// mergeable; the ratios a dashboard wants are not additive, so they're derived here on read, never stored.

import type { ExtraStats } from "../contract/views";

/** 0 when the denominator is non-positive (avoids NaN/Infinity from an empty rollup). */
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

export function cacheHitRate(cacheReadTokens: number, cacheWriteTokens: number): number {
  return div(cacheReadTokens, cacheReadTokens + cacheWriteTokens);
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
