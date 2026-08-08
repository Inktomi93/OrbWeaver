// backends/kit/cache-control — the Anthropic anchor (rejects third-party forks), the routing pin, and the
// placement primitive. The anchor is load-bearing: an alien backend whose name contains "claude" must NOT
// receive Anthropic-only cache_control.

import { logger } from "@orb/server/foundation/observability";
import type { CacheBreakpointRow } from "@orb/server/infra/providers/backends/kit";
import {
  ANTHROPIC_CACHE_1H,
  anthropicCacheDirective,
  CACHE_TTLS,
  cacheControlBlock,
  computeCacheBreakpointPlacements,
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

// computeCacheBreakpointPlacements (W3): the PURE positional core of the R1 rolling PAIR. From the ONE
// SHAPE-computed safe DEPTH it returns the pair of placements (`depth` AND `depth+2`) whose cumulative
// prefix clears the per-model `cacheMinTokens` floor. No wire types — each runner (OR openai-compat /
// anth-direct) maps the returned indices to its own block dialect. The single breakpoint was the regression
// (part 01 §1d / part 02 §5d); this hoisted core emits the pair.
//
// The DEPTH axis is role switches from the end, with within-turn tool exchanges transparent and system rows
// consuming no depth (findings §5 — the source file states the full rationale). On a plain role-alternating
// history depth === array offset, which is why the pre-existing rows below are unchanged.
describe("computeCacheBreakpointPlacements — the R1 rolling pair", () => {
  // 6 role-alternating messages, 500 tokens each; systemStatic 0. Cumulative prefix at index i = 500*(i+1).
  const rows = (["user", "assistant", "user", "assistant", "user", "assistant"] as const).map((role) => ({
    role,
    toolExchange: false,
    tokens: 500,
  }));

  test("returns BOTH placements of the pair when each clears the floor", () => {
    // depth 1 → idx 4 (prefix 2500); depth 3 → idx 2 (prefix 1500). floor 1024: both clear.
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 1, cacheMinTokens: 1024 })).toEqual([
      { depth: 1, index: 4 },
      { depth: 3, index: 2 },
    ]);
  });

  test("the pair is `depth` AND `depth+2` (not two adjacent breakpoints)", () => {
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 0, cacheMinTokens: 1 })).toEqual([
      { depth: 0, index: 5 },
      { depth: 2, index: 3 },
    ]);
  });

  test("drops the deeper (`depth+2`) breakpoint when its prefix is below the floor (still keeps depth)", () => {
    // depth 1 → idx 4 (prefix 2500 ✓); depth 3 → idx 2 (prefix 1500 ✗ under 2000). Only `depth` survives.
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 1, cacheMinTokens: 2000 })).toEqual([{ depth: 1, index: 4 }]);
  });

  test("drops the deeper breakpoint when `depth+2` runs off the front of the history", () => {
    // depth 5 → idx 0 (in range); depth 7 → no such role group. Only `depth` survives.
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 5, cacheMinTokens: 1 })).toEqual([{ depth: 5, index: 0 }]);
  });

  test("returns EMPTY when even `depth` is below the floor (no breakpoint placed)", () => {
    const tiny = [
      { role: "user", toolExchange: false, tokens: 10 },
      { role: "assistant", toolExchange: false, tokens: 10 },
    ];
    expect(computeCacheBreakpointPlacements({ rows: tiny, systemStaticTokens: 0, depthFromEnd: 0, cacheMinTokens: 1024 })).toEqual([]);
  });

  test("the systemStatic tokens count toward the prefix floor", () => {
    const tiny = [
      { role: "user", toolExchange: false, tokens: 10 },
      { role: "assistant", toolExchange: false, tokens: 10 },
    ];
    // depth idx prefix would be 20 without system; systemStatic 2000 pushes it over 1024.
    expect(computeCacheBreakpointPlacements({ rows: tiny, systemStaticTokens: 2000, depthFromEnd: 0, cacheMinTokens: 1024 })).toEqual([
      { depth: 0, index: 1 }, // depth 2 has no role group left
    ]);
  });
});

// The DEPTH AXIS itself (findings §5). Each case below is a history shape the array-offset placer got wrong,
// or one it got right and must keep getting right.
describe("computeCacheBreakpointPlacements — the conversational depth axis", () => {
  // 600 tokens/row so a TWO-row prefix (the `depth+2` leg's target at index 1) clears the 1024 floor.
  const conv = (role: string, tokens = 600): CacheBreakpointRow => ({ role, toolExchange: false, tokens });
  const toolRow = (role: string, tokens = 20): CacheBreakpointRow => ({ role, toolExchange: true, tokens });

  test("a within-turn tool exchange consumes NO depth — depth 1 lands on the same row before and after", () => {
    const canon = [conv("user"), conv("assistant"), conv("user"), conv("assistant"), conv("user")];
    const before = computeCacheBreakpointPlacements({ rows: canon, systemStaticTokens: 0, depthFromEnd: 1, cacheMinTokens: 1024 });
    // One recursion depth of THREE parallel calls: 1 assistant tool-call row + 3 `tool` rows = 4 array rows.
    const after = computeCacheBreakpointPlacements({
      rows: [...canon, toolRow("assistant"), toolRow("tool"), toolRow("tool"), toolRow("tool")],
      systemStaticTokens: 0,
      depthFromEnd: 1,
      cacheMinTokens: 1024,
    });
    expect(before.map((p) => p.index)).toEqual([3, 1]);
    expect(after).toEqual(before);
  });

  test("adjacent same-role rows are ONE depth group (the role-switch unit, not the array unit)", () => {
    // user user assistant user — `roleHandling:"none"` delivers unsquashed runs. depth 0 = the trailing user
    // group; depth 1 = the assistant; depth 2 = the leading user RUN, whose newest row is index 1.
    const rows = [conv("user"), conv("user"), conv("assistant"), conv("user")];
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 2, cacheMinTokens: 1 })).toEqual([{ depth: 2, index: 1 }]);
  });

  test("a system row consumes NO depth and never receives a breakpoint (ST parity)", () => {
    // user assistant SYSTEM user — the mid-conversation system injection must not shift the axis.
    const rows = [conv("user"), conv("assistant"), conv("system"), conv("user")];
    const placed = computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 1, cacheMinTokens: 1 });
    expect(placed).toEqual([{ depth: 1, index: 1 }]); // the assistant, NOT the system row at index 2
  });

  test("a trailing assistant PREFILL row is depth 0 — our anchor is the volatile tail, whatever its role", () => {
    // ST re-anchors past the prefill; we do NOT (`computeHistoryBreakpoint` counts the tail as index 0, so
    // re-anchoring would shift every depth one group against its own producer). depth 1 → the user turn.
    const rows = [conv("user"), conv("assistant"), conv("user"), conv("assistant")];
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 1, cacheMinTokens: 1 })).toEqual([
      { depth: 1, index: 2 },
      { depth: 3, index: 0 },
    ]);
  });

  test("depth 0 targets the newest conversational row, skipping a trailing tool exchange", () => {
    const rows = [conv("user"), conv("assistant"), conv("user"), toolRow("assistant"), toolRow("tool")];
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 0, cacheMinTokens: 1 })).toEqual([
      { depth: 0, index: 2 },
      { depth: 2, index: 0 },
    ]);
  });

  test("an all-tool-exchange history has no conversational depth at all", () => {
    expect(
      computeCacheBreakpointPlacements({ rows: [toolRow("assistant"), toolRow("tool")], systemStaticTokens: 5000, depthFromEnd: 0, cacheMinTokens: 1 }),
    ).toEqual([]);
  });

  test("tool-exchange tokens still COUNT toward the prefix floor (they are real bytes on the wire)", () => {
    // The only row before the target is a tool row worth 2000 tokens; the floor must see it.
    const rows = [toolRow("tool", 2000), conv("user", 10), conv("assistant", 10)];
    expect(computeCacheBreakpointPlacements({ rows, systemStaticTokens: 0, depthFromEnd: 1, cacheMinTokens: 1024 })).toEqual([{ depth: 1, index: 1 }]);
  });

  test("an empty history places nothing", () => {
    expect(computeCacheBreakpointPlacements({ rows: [], systemStaticTokens: 9999, depthFromEnd: 0, cacheMinTokens: 1 })).toEqual([]);
  });
});
