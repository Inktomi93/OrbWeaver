// substrate/rates — pure read-layer rate math. div guards a zero denominator; the named rates derive the
// non-additive ratios from the additive rollup columns.

import { describe } from "vitest";
import {
  cacheHitRate,
  deriveExtra,
  div,
  reasoningRate,
  throughputTps,
} from "../../../../../packages/server/src/domain/stats/substrate/rates.ts";
import { expect, test } from "../../../../support/fixtures";

describe("rate helpers", () => {
  test("div returns 0 for a non-positive denominator (no NaN/Infinity)", () => {
    expect(div(10, 0)).toBe(0);
    expect(div(10, 2)).toBe(5);
  });

  test("throughputTps = tokensOut / (genTimeMs / 1000)", () => {
    expect(throughputTps(2000, 1000)).toBe(2000);
    expect(throughputTps(5, 0)).toBe(0);
  });

  test("cacheHitRate = read / (read + write)", () => {
    expect(cacheHitRate(30, 10)).toBe(0.75);
    expect(cacheHitRate(0, 0)).toBe(0);
  });

  test("reasoningRate = reasoningGenerations / gens", () => {
    expect(reasoningRate(1, 4)).toBe(0.25);
  });
});

describe("deriveExtra", () => {
  test("derives the ExtraStats block from additive columns", () => {
    const e = deriveExtra({
      reasoningMs: 50,
      costUsd: 1.5,
      cacheReadTokens: 30,
      cacheWriteTokens: 10,
      forkedChats: 2,
      variantMessages: 4,
      maxContextTokens: 8000,
      tokensOut: 1000,
      totalGenTimeMs: 2000,
      activeIdxSum: 8,
      assistantTurns: 8,
      assistantWords: 80,
    });
    expect(e.throughputTps).toBe(500); // 1000 / (2000/1000)
    expect(e.avgSwipeDepth).toBe(2); // 8 / 4
    expect(e.swipeRate).toBe(0.5); // 4 / 8
    expect(e.cacheHitRate).toBe(0.75); // 30 / 40
    expect(e.avgReplyWords).toBe(10); // 80 / 8
    expect(e.maxContextTokens).toBe(8000);
  });
});
