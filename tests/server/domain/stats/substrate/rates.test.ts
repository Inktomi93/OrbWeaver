// substrate/rates — pure read-layer rate math. div guards a zero denominator; the named rates derive the
// non-additive ratios from the additive rollup columns; the `recorded*` pair decides UNRECORDED vs zero.

import { describe } from "vitest";
import {
  aggregateTokenProvenance,
  cacheHitRate,
  deriveExtra,
  div,
  reasoningRate,
  recordedCost,
  recordedTokens,
  throughputTps,
} from "../../../../../packages/server/src/domain/stats/substrate/rates.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("rate helpers", () => {
  test("div returns 0 for a non-positive denominator (no NaN/Infinity)", () => {
    expect(div(10, 0)).toBe(0);
    expect(div(10, 2)).toBe(5);
  });

  test("throughputTps = tokensOut / (genTimeMs / 1000)", () => {
    expect(throughputTps(2000, 1000)).toBe(2000);
    expect(throughputTps(5, 0)).toBe(0);
  });

  test("reasoningRate = reasoningGenerations / gens", () => {
    expect(reasoningRate(1, 4)).toBe(0.25);
  });
});

// THE CONSTANT THAT WORE A PERCENTAGE'S CLOTHES (side-eye rail-analytics 2026-08-19 P1a). Only Anthropic
// reports cache-WRITE tokens, so `read / (read + write)` returned exactly 1 for every other backend and
// exactly 0 for one that reports neither — a number that could not vary with the thing it claimed to
// measure. The live wire behind the finding: 32,217 read / 0 write / 1,664,309 in, rendered "100%".
describe("cacheHitRate is the share of INPUT tokens, or null", () => {
  test("read-only accounting no longer collapses to 100%", () => {
    expect(cacheHitRate(32_217, 0, 1_664_309)).toBeCloseTo(0.019_36, 5);
  });

  test("read + write against input is the input share, not the cache-column ratio", () => {
    expect(cacheHitRate(30, 10, 200)).toBe(0.15);
  });

  test("null when the row carries NO cache accounting at all (nothing measured, not 0%)", () => {
    expect(cacheHitRate(0, 0, 5000)).toBeNull();
    // character_stats has no cache columns whatsoever — every per-character read lands here.
    expect(cacheHitRate(0, 0, 0)).toBeNull();
  });

  test("null when there is no input-token denominator to divide by", () => {
    expect(cacheHitRate(100, 0, 0)).toBeNull();
  });
});

// An absent token/cost measurement is not 0 tok or $0.00. Imported and agent-sdk turns can have null token
// columns despite real replies; the display must preserve that distinction.
describe("recordedTokens / recordedCost decide unrecorded vs zero", () => {
  test("no provenance samples means UNRECORDED even behind real generations", () => {
    expect(recordedTokens(0, 0, 0)).toBeNull();
    expect(aggregateTokenProvenance(0, 0)).toBe("unrecorded");
  });

  test("a measured sample preserves a genuine zero", () => {
    expect(recordedTokens(0, 1, 0)).toBe(0);
    expect(aggregateTokenProvenance(1, 0)).toBe("measured");
  });

  test("an estimate passes through but dominates a mixed aggregate's label", () => {
    expect(recordedTokens(1_664_309, 11_750, 2)).toBe(1_664_309);
    expect(aggregateTokenProvenance(11_750, 2)).toBe("estimated");
  });

  test("cost uses its own sample counter — estimated tokens never manufacture dollars", () => {
    expect(recordedCost(0, 0, 0)).toBeNull();
    expect(recordedCost(0, 1, 0)).toBe(0);
    expect(recordedCost(0.037_678_5, 3, 0)).toBe(0.037_678_5);
  });
});

describe("deriveExtra", () => {
  test("compatible price samples remain visible; known mixed or unsettled signed samples stay unavailable", () => {
    const base = {
      reasoningMs: 0,
      costUsd: 0.375,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      forkedChats: 0,
      variantMessages: 0,
      maxContextTokens: null,
      tokensIn: 0,
      tokensOut: 0,
      costSamples: 2,
      totalGenTimeMs: 0,
      activeIdxSum: 0,
      assistantTurns: 0,
      assistantWords: 0,
      swipes: 0,
    };
    const mixed = { ...base, notionalCostSamples: 1 };
    const subscription = { ...base, notionalCostSamples: 2 };
    const unclassified = { ...base, notionalCostSamples: 0 };
    const inverseBeforeRebuild = { ...base, notionalCostSamples: -1 };
    expect(deriveExtra(mixed).costUsd).toBeNull();
    expect(deriveExtra(subscription).costUsd).toBe(0.375);
    expect(deriveExtra(unclassified).costUsd).toBe(0.375);
    expect(deriveExtra(inverseBeforeRebuild).costUsd).toBeNull();
    expect(deriveExtra({ ...base, costUsd: 0, costSamples: 1, notionalCostSamples: 1 }).costUsd).toBe(0);
  });
  test("derives the ExtraStats block from additive columns", () => {
    const e = deriveExtra({
      reasoningMs: 50,
      costUsd: 1.5,
      cacheReadTokens: 30,
      cacheWriteTokens: 10,
      forkedChats: 2,
      variantMessages: 4,
      maxContextTokens: 8000,
      tokensIn: 200,
      tokensOut: 1000,
      costSamples: 2,
      notionalCostSamples: 0,
      totalGenTimeMs: 2000,
      activeIdxSum: 8,
      assistantTurns: 8,
      assistantWords: 80,
      swipes: 2,
    });
    expect(e.throughputTps).toBe(500); // 1000 / (2000/1000)
    expect(e.avgSwipeDepth).toBe(2); // 8 / 4
    expect(e.swipeRate).toBe(0.5); // 4 / 8
    expect(e.cacheHitRate).toBe(0.15); // 30 read / 200 input tokens
    expect(e.avgReplyWords).toBe(10); // 80 / 8
    expect(e.costUsd).toBe(1.5);
    expect(e.maxContextTokens).toBe(8000);
  });

  test("an imported rollup — generations, no usage — derives NULL cost and NULL cache rate", () => {
    const e = deriveExtra({
      reasoningMs: 0,
      costUsd: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      forkedChats: 0,
      variantMessages: 7526,
      maxContextTokens: null,
      tokensIn: 0,
      tokensOut: 0,
      costSamples: 0,
      notionalCostSamples: 0,
      totalGenTimeMs: 900_000,
      activeIdxSum: 0,
      assistantTurns: 1187,
      assistantWords: 400_000,
      swipes: 7526,
    });
    expect(e.costUsd).toBeNull();
    expect(e.cacheHitRate).toBeNull();
  });
});
