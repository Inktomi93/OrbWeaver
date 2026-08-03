// THE CACHE-CORRECTNESS ACCEPTANCE GATE — UNIT tier (04 §1a). Asserts the RESOLVED `turns` flags per
// (model × wire-shape), so a regression flips a RED test on a fast, quota-free run. Cache-rightness rots
// SILENTLY (a broken breakpoint just re-bills ~12.7k tokens/turn — nothing throws); this gate makes it
// STRUCTURALLY IMPOSSIBLE to "finish" a cache-touching wave with cache broken.
//
// Behavior-neutrality (04 §1): every seeded cell = today's behavior. `explicitPromptCache:true` for the
// ANTHROPIC family ONLY, the per-model `cacheMinTokens`, `roleHandlingFloor:"strict"` on every Claude arm,
// `assistantPrefill:false` on the cli/agent-sdk shape, `midConversationSystem` matching the hook fact.

import type { ModelCapability } from "@orb/contracts/connection";
import { CACHE_MIN_FLOOR } from "@orb/contracts/connection";
import { describe } from "vitest";
import { resolveModelCapability } from "../../../../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import { expect, test } from "../../../../support/fixtures.ts";

type Turns = ModelCapability["turns"];

// (model, source, api) tuples for the two cache-bearing shapes each Claude reaches:
//   openai-compat (Claude-via-OR chat-completions) and anthropic-cli (agent-sdk / max-pro-sub).
const compat = (model: string): Turns => resolveModelCapability(model, "openrouter", "chat-completions").turns;
const cli = (model: string): Turns => resolveModelCapability(model, "max-pro-sub", "agent-sdk").turns;

describe("cache gate — explicitPromptCache is an ANTHROPIC-FAMILY fact (ruling 3)", () => {
  test("anthropic Claude ⇒ true on BOTH cache-bearing shapes", () => {
    expect(compat("claude-opus-4-8")?.explicitPromptCache).toBe(true);
    expect(cli("claude-opus-4-8")?.explicitPromptCache).toBe(true);
    expect(compat("claude-haiku-4-5")?.explicitPromptCache).toBe(true);
  });

  test("a non-anthropic family ⇒ false (OR auto-caches those with no field)", () => {
    expect(compat("openai/gpt-5")?.explicitPromptCache).toBe(false);
    expect(compat("meta-llama/llama-4")?.explicitPromptCache).toBe(false);
    expect(compat("google/gemini-2.5-pro")?.explicitPromptCache).toBe(false);
  });
});

describe("cache gate — cacheMinTokens per-model floor (part 02 §5d table)", () => {
  test("curated shortlist entries carry their exact floor", () => {
    expect(cli("claude-opus-4-8")?.cacheMinTokens).toBe(1024); // Opus 4.8
    expect(cli("claude-sonnet-5")?.cacheMinTokens).toBe(1024); // Sonnet 5
    expect(cli("claude-haiku-4-5")?.cacheMinTokens).toBe(4096); // Haiku 4.5 (was undercaching at 1024)
  });

  test("synthesized (non-curated) anthropic ids carry the per-version floor", () => {
    expect(compat("anthropic/claude-opus-4-7")?.cacheMinTokens).toBe(2048);
    expect(compat("anthropic/claude-opus-4-6")?.cacheMinTokens).toBe(4096);
    expect(compat("anthropic/claude-opus-4-5")?.cacheMinTokens).toBe(4096);
    expect(compat("anthropic/claude-sonnet-4-6")?.cacheMinTokens).toBe(1024);
    expect(compat("anthropic/claude-fable-5")?.cacheMinTokens).toBe(512);
    expect(compat("anthropic/claude-mythos-5")?.cacheMinTokens).toBe(512);
  });

  test("an anthropic id with an unlisted version fails CLOSED to CACHE_MIN_FLOOR", () => {
    expect(compat("anthropic/claude-opus-9-9")?.cacheMinTokens).toBe(CACHE_MIN_FLOOR);
  });
});

describe("cache gate — roleHandlingFloor is strict on every Claude arm", () => {
  test("anthropic ⇒ strict on both shapes", () => {
    expect(compat("claude-opus-4-8")?.roleHandlingFloor).toBe("strict");
    expect(cli("claude-opus-4-8")?.roleHandlingFloor).toBe("strict");
  });

  test("open-weight families floor to strict (fail-closed — no instruct signal)", () => {
    expect(compat("meta-llama/llama-4")?.roleHandlingFloor).toBe("strict");
    expect(compat("qwen/qwen3-32b")?.roleHandlingFloor).toBe("strict");
  });
});

describe("cache gate — midConversationSystem (the volatile-channel gating flag)", () => {
  test("Opus 4.8 honors it on the anthropic-messages shape (cli), NOT on openai-compat", () => {
    expect(cli("claude-opus-4-8")?.midConversationSystem).toBe(true);
    expect(compat("claude-opus-4-8")?.midConversationSystem).toBe(false);
  });

  test("Sonnet 5 / Haiku do NOT honor it anywhere", () => {
    expect(cli("claude-sonnet-5")?.midConversationSystem).toBe(false);
    expect(cli("claude-haiku-4-5")?.midConversationSystem).toBe(false);
    expect(compat("openai/gpt-5")?.midConversationSystem).toBe(false);
  });
});

describe("cache gate — assistantPrefill per (model × transport)", () => {
  test("the cli transport NEVER emits prefill (4.6+ refuse; sub/OR-key CLI never emits it)", () => {
    expect(cli("claude-opus-4-8")?.assistantPrefill).toBe(false);
    expect(cli("claude-haiku-4-5")?.assistantPrefill).toBe(false);
  });

  test("openai-compat: the live matrix — opus-4.5/haiku-4.5 true, opus-4.8/sonnet-4.6 false", () => {
    expect(compat("anthropic/claude-opus-4-5")?.assistantPrefill).toBe(true);
    expect(compat("claude-haiku-4-5")?.assistantPrefill).toBe(true);
    expect(compat("claude-opus-4-8")?.assistantPrefill).toBe(false);
    expect(compat("anthropic/claude-sonnet-4-6")?.assistantPrefill).toBe(false);
  });
});

describe("behavior-neutrality — non-anthropic + static arms resolve to the non-caching floor", () => {
  test("a non-anthropic OR model gets TURNS_FLOOR (no explicit cache, strict floor)", () => {
    const t = compat("openai/gpt-5");
    expect(t).toEqual({
      assistantPrefill: false,
      midConversationSystem: false,
      roleHandlingFloor: "strict",
      explicitPromptCache: false,
    });
  });

  test("the vLLM static arm is non-caching", () => {
    const t = resolveModelCapability("Qwen/Qwen3-8B", "vllm", "chat-completions").turns;
    expect(t?.explicitPromptCache).toBe(false);
  });
});
