// substrate/rates — pure read-layer rate math. div guards a zero denominator; the named rates derive the
// non-additive ratios from the additive rollup columns; the `recorded*` pair decides UNRECORDED vs zero.

import { describe } from "vitest";
import {
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

// `0 tok` / `$0.00` asserted a measurement that never happened on ST-imported and agent-sdk turns. Probed
// against the owner corpus 2026-08-19: 8,713 of one character's variants carry NULL on BOTH token columns
// while that character has 1,187 real replies — the rollup's 0 is absence, not a measurement.
describe("recordedTokens / recordedCost decide unrecorded vs zero", () => {
  test("a total of 0 behind real generations is UNRECORDED", () => {
    expect(recordedTokens(0, 1187)).toBeNull();
  });

  test("a total of 0 behind NO generations is a true zero", () => {
    expect(recordedTokens(0, 0)).toBe(0);
  });

  test("any measured total passes through", () => {
    expect(recordedTokens(1_664_309, 11_750)).toBe(1_664_309);
  });

  test("cost is unrecorded only when the usage behind it is — a free local model still costs $0", () => {
    expect(recordedCost(0, 0, 62)).toBeNull();
    expect(recordedCost(0, 48_092, 62)).toBe(0);
    expect(recordedCost(0.037_678_5, 100_772, 3)).toBe(0.037_678_5);
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
      tokensIn: 200,
      tokensOut: 1000,
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
