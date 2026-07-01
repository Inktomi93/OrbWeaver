// backends/kit/cache-control — the Anthropic anchor (rejects third-party forks), the routing pin, and the
// placement primitive. The anchor is load-bearing: an alien backend whose name contains "claude" must NOT
// receive Anthropic-only cache_control.

import {
  ANTHROPIC_CACHE_5M,
  cacheControlBlock,
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
