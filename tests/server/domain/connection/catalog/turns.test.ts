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
import {
  ANTH_DIRECT_PRE_CUTOFF_SAMPLING,
  ANTHROPIC_TEMP_RANGE,
  refineAnthDirectSampling,
} from "../../../../../packages/server/src/domain/connection/catalog/turns.ts";
import { expect, test } from "../../../../support/fixtures";

type Turns = ModelCapability["turns"];
type Sampling = ModelCapability["sampling"];

// (model, source, api) tuples for the two cache-bearing shapes each Claude reaches:
//   openai-compat (Claude-via-OR chat-completions) and anthropic-cli (agent-sdk / max-pro-sub).
const compat = (model: string): Turns => resolveModelCapability(model, "openrouter", "chat-completions").turns;
const cli = (model: string): Turns => resolveModelCapability(model, "max-pro-sub", "agent-sdk").turns;
// anthropic-direct = the OR-key `/v1/messages` skin. It DOES cache (probe-confirmed 2026-07-10: 13001 read
// once the reducer read usage from `message_delta`, where OR delivers it — not `message_start`). So its cell
// is explicitPromptCache:true like every other cache-bearing Anthropic wire.
const direct = (model: string): Turns => resolveModelCapability(model, "openrouter", "anthropic-messages").turns;

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

  test("anthropic-direct (OR /v1/messages) ⇒ TRUE — OR caches it (13001 read, probe-confirmed)", () => {
    // OR's /v1/messages passthrough caches like chat-completions; the earlier 0/0 was a reducer reading usage
    // from message_start (OR sends it in message_delta), now fixed. So anth-direct is a real caching wire.
    expect(direct("claude-opus-4-8")?.explicitPromptCache).toBe(true);
    expect(direct("claude-haiku-4-5")?.explicitPromptCache).toBe(true);
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

// W9 (D68-C) — the direct-transport Claude SAMPLING seam. The raw Messages wire carries
// temperature/top_p/top_k/stop_sequences, but the SDK documents post-Opus-4.6 models as REJECTING non-default
// values (part 03 §3 — a live 400). So `refineAnthDirectSampling` is a PER-MODEL fact, SEEDED `{}` on every
// entry until the W9 hand-run probe verifies it — a blanket unlock is a 400 factory. Only the anthropic-direct
// wire-shape ever gets a non-`{}` seed; every other shape passes the base sampling through unchanged.
describe("refineAnthDirectSampling — the direct-transport seam is WIRED (not an accidental {})", () => {
  test("on the anthropic-direct shape, an UNSEEDED id ⇒ {} (fail-closed), never the base", () => {
    // The base sampling is DISCARDED on the direct shape when the id is unseeded — proving the refinement
    // runs (a tautology-{} would leak the base's temperature through).
    const base: Sampling = { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 } };
    expect(refineAnthDirectSampling("claude-opus-4-8", "anthropic-direct", base)).toEqual({});
  });

  test("on a NON-direct shape, the base sampling passes through UNCHANGED (same reference)", () => {
    const base: Sampling = { temperature: { min: 0, max: 2 } };
    expect(refineAnthDirectSampling("claude-opus-4-8", "anthropic-cli", base)).toBe(base);
    expect(refineAnthDirectSampling("claude-haiku-4-5", "openai-compat", base)).toBe(base);
  });

  test("the opened-entry sampling set uses Anthropic's 0–1 temp range (NOT the OpenAI 0–2)", () => {
    // The capability an opened entry resolves to — asserts the range is the distinct Anthropic bound (part
    // 03 §3), so opening an entry can never accidentally re-use the OpenAI 0–2 ceiling.
    expect(ANTH_DIRECT_PRE_CUTOFF_SAMPLING.temperature).toBe(ANTHROPIC_TEMP_RANGE);
    expect(ANTHROPIC_TEMP_RANGE).toEqual({ min: 0, max: 1 });
    expect(ANTH_DIRECT_PRE_CUTOFF_SAMPLING.stop).toBe(true);
  });
});
