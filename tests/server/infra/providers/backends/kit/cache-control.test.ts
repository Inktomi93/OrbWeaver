// backends/kit/cache-control — the Anthropic anchor (rejects third-party forks), the routing pin, and the
// placement primitive. The anchor is load-bearing: an alien backend whose name contains "claude" must NOT
// receive Anthropic-only cache_control.

import {
  ANTHROPIC_CACHE_5M,
  cacheControlBlock,
  computeCacheBreakpointOffsets,
  effectiveProviderRouting,
  isAnthropicModel,
} from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

describe("isAnthropicModel — the load-bearing anchor", () => {
  test("matches the bare Anthropic id and the OpenRouter-prefixed form", () => {
    expect(isAnthropicModel("claude-opus-4-8")).toBe(true);
    expect(isAnthropicModel("claude-haiku-4-5-20251001")).toBe(true);
    expect(isAnthropicModel("anthropic/claude-sonnet-4-6")).toBe(true);
    expect(isAnthropicModel("claude/whatever")).toBe(true);
    expect(isAnthropicModel("CLAUDE-OPUS-4-8")).toBe(true);
  });

  test("REJECTS third-party forks and non-Anthropic models (no Anthropic-only directives)", () => {
    expect(isAnthropicModel("some-org/claude-fork-model")).toBe(false);
    expect(isAnthropicModel("openai/gpt-4o")).toBe(false);
    expect(isAnthropicModel("gpt-4")).toBe(false);
    expect(isAnthropicModel("google/gemini-2.5-pro")).toBe(false);
    // "claude" with no `-`/`/` boundary after it does not match.
    expect(isAnthropicModel("anthropic/claude")).toBe(false);
    expect(isAnthropicModel("claudette-1")).toBe(false);
  });
});

describe("effectiveProviderRouting — Anthropic provider pin", () => {
  test("a caller-supplied routing always wins (the user is in control)", () => {
    const userRouting = { order: ["DeepInfra"] };
    expect(effectiveProviderRouting("claude-opus-4-8", userRouting)).toBe(userRouting);
  });

  test("an Anthropic model with no user routing pins the Anthropic provider (order-only)", () => {
    expect(effectiveProviderRouting("anthropic/claude-haiku-4-5", undefined)).toEqual({
      order: ["Anthropic"],
    });
  });

  test("a non-Anthropic model with no user routing → undefined (default routing)", () => {
    expect(effectiveProviderRouting("openai/gpt-4o", undefined)).toBeUndefined();
  });

  test("returns a FRESH object each call (no shared-mutable singleton)", () => {
    const a = effectiveProviderRouting("claude-opus-4-8", undefined);
    const b = effectiveProviderRouting("claude-opus-4-8", undefined);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("cache_control constants + placement primitive", () => {
  test("ANTHROPIC_CACHE_5M is the bare ephemeral directive (no explicit ttl)", () => {
    expect(ANTHROPIC_CACHE_5M).toEqual({ type: "ephemeral" });
  });

  test("cacheControlBlock wraps content into the cache_control-bearing text block", () => {
    expect(cacheControlBlock("the stable system prefix")).toEqual({
      type: "text",
      text: "the stable system prefix",
      cacheControl: { type: "ephemeral" },
    });
  });
});

// computeCacheBreakpointOffsets (W3): the PURE positional core of the R1 rolling PAIR. From the ONE
// SHAPE-computed safe offset it returns the pair of offsets-from-end (`depth` AND `depth+2`) whose
// cumulative prefix clears the per-model `cacheMinTokens` floor. No wire types — each runner (OR
// openai-compat / anth-direct) maps the returned offsets to its own block dialect. The single breakpoint
// was the regression (part 01 §1d / part 02 §5d); this hoisted core emits the pair.
// biome-ignore lint/security/noSecrets: the long camelCase fn name in the title trips the entropy heuristic — a test description, not a secret.
describe("computeCacheBreakpointOffsets — the R1 rolling pair", () => {
  // 6 messages, 500 tokens each; systemStatic 0. Cumulative prefix at index i = 500 * (i + 1).
  const messageTokens = [500, 500, 500, 500, 500, 500];

  test("returns BOTH offsets of the pair when each clears the floor", () => {
    // offset 1 → idx 4 (prefix 2500); offset 3 → idx 2 (prefix 1500). floor 1024: both clear.
    const offsets = computeCacheBreakpointOffsets({
      messageTokens,
      systemStaticTokens: 0,
      offsetFromEnd: 1,
      cacheMinTokens: 1024,
    });
    expect(offsets).toEqual([1, 3]);
  });

  test("the pair is `depth` AND `depth+2` (not two adjacent breakpoints)", () => {
    const offsets = computeCacheBreakpointOffsets({
      messageTokens,
      systemStaticTokens: 0,
      offsetFromEnd: 0,
      cacheMinTokens: 1,
    });
    expect(offsets).toEqual([0, 2]);
  });

  test("drops the deeper (`depth+2`) breakpoint when its prefix is below the floor (still keeps depth)", () => {
    // offset 1 → idx 4 (prefix 2500 ✓); offset 3 → idx 2 (prefix 1500 ✗ under 2000). Only `depth` survives.
    const offsets = computeCacheBreakpointOffsets({
      messageTokens,
      systemStaticTokens: 0,
      offsetFromEnd: 1,
      cacheMinTokens: 2000,
    });
    expect(offsets).toEqual([1]);
  });

  test("drops the deeper breakpoint when `depth+2` runs off the front of the array", () => {
    // offset 5 → idx 0 (in range); offset 7 → idx -2 (out of range). Only `depth` survives.
    const offsets = computeCacheBreakpointOffsets({
      messageTokens,
      systemStaticTokens: 0,
      offsetFromEnd: 5,
      cacheMinTokens: 1,
    });
    expect(offsets).toEqual([5]);
  });

  test("returns EMPTY when even `depth` is below the floor (no breakpoint placed)", () => {
    const offsets = computeCacheBreakpointOffsets({
      messageTokens: [10, 10],
      systemStaticTokens: 0,
      offsetFromEnd: 0,
      cacheMinTokens: 1024,
    });
    expect(offsets).toEqual([]);
  });

  test("the systemStatic tokens count toward the prefix floor", () => {
    // depth idx prefix would be 20 without system; systemStatic 2000 pushes it over 1024.
    const offsets = computeCacheBreakpointOffsets({
      messageTokens: [10, 10],
      systemStaticTokens: 2000,
      offsetFromEnd: 0,
      cacheMinTokens: 1024,
    });
    expect(offsets).toEqual([0]); // depth+2 (idx -2) out of range
  });
});
