// backends/kit/cache-control — the Anthropic anchor (rejects third-party forks), the routing pin, and the
// placement primitive. The anchor is load-bearing: an alien backend whose name contains "claude" must NOT
// receive Anthropic-only cache_control.

import { logger } from "@orb/server/foundation/observability";
import {
  ANTHROPIC_CACHE_1H,
  anthropicCacheDirective,
  CACHE_TTLS,
  cacheControlBlock,
  computeCacheBreakpointOffsets,
  effectiveProviderRouting,
  isAnthropicModel,
} from "@orb/server/infra/providers/backends/kit";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

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

  // Findings §2: `order` alone does NOT pin — allow_fallbacks defaults TRUE and a probe caught the chain
  // walking Anthropic → Bedrock → Azure → Google, every hop ignoring cache_control and re-billing the prefix.
  test("an Anthropic model with no user routing pins Anthropic AND forbids provider fallbacks", () => {
    expect(effectiveProviderRouting("anthropic/claude-haiku-4-5", undefined)).toEqual({
      order: ["Anthropic"],
      // biome-ignore lint/style/useNamingConvention: `allow_fallbacks` is OpenRouter's own wire field name.
      allow_fallbacks: false,
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
  // Findings §1: the 1h TTL is honored on the OR wire with NO anthropic-beta header (proved by the 2.0x
  // cache-write price multiplier vs 1.25x for 5m). Shipping the bare directive silently bought 5m.
  test("ANTHROPIC_CACHE_1H carries the explicit 1h ttl", () => {
    expect(ANTHROPIC_CACHE_1H).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  test("cacheControlBlock wraps content into the cache_control-bearing text block (ttl included)", () => {
    expect(cacheControlBlock("the stable system prefix")).toEqual({
      type: "text",
      text: "the stable system prefix",
      cacheControl: { type: "ephemeral", ttl: "1h" },
    });
  });
});

// Findings §3: an invalid ttl is NOT an upstream error — OpenRouter answers 200 and drops the whole
// cache_control block (cacheWrite 0, ~10x cost, no signal). The seam is the only guard that exists.
describe("anthropicCacheDirective — the ttl allowlist guard", () => {
  test("the allowlist is exactly the two TTLs Anthropic accepts", () => {
    expect(CACHE_TTLS).toEqual(["5m", "1h"]);
  });

  test("an allowlisted ttl rides the directive verbatim", () => {
    expect(anthropicCacheDirective("5m")).toEqual({ type: "ephemeral", ttl: "5m" });
    expect(anthropicCacheDirective("1h")).toEqual({ type: "ephemeral", ttl: "1h" });
  });

  test("an off-allowlist ttl is STRIPPED to the bare (always-accepted) directive — never sent as garbage", () => {
    // Sending "9z" is what measured 200 OK + zero caching; stripping keeps the block alive at the 5m default.
    expect(anthropicCacheDirective("9z")).toEqual({ type: "ephemeral" });
    expect(anthropicCacheDirective("")).toEqual({ type: "ephemeral" });
    expect(anthropicCacheDirective("1H")).toEqual({ type: "ephemeral" });
  });

  test("the reject is LOUD — a provider.cache_ttl_rejected warn line carries the offending value (D41)", () => {
    const spy = vi.spyOn(logger, "warn");
    anthropicCacheDirective("9z");
    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.cache_ttl_rejected");
    expect(line).toBeDefined();
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["ttl"]).toBe("9z");
    expect(fields["accepted"]).toEqual(["5m", "1h"]);
    expect(fields["applied"]).toBeNull();
    expect(fields["provider"]).toBe(true);
  });

  test("a valid ttl emits NO warning (the guard is silent on the happy path)", () => {
    const spy = vi.spyOn(logger, "warn");
    anthropicCacheDirective("1h");
    expect(spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.cache_ttl_rejected")).toBeUndefined();
  });
});

// computeCacheBreakpointOffsets (W3): the PURE positional core of the R1 rolling PAIR. From the ONE
// SHAPE-computed safe offset it returns the pair of offsets-from-end (`depth` AND `depth+2`) whose
// cumulative prefix clears the per-model `cacheMinTokens` floor. No wire types — each runner (OR
// openai-compat / anth-direct) maps the returned offsets to its own block dialect. The single breakpoint
// was the regression (part 01 §1d / part 02 §5d); this hoisted core emits the pair.
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
