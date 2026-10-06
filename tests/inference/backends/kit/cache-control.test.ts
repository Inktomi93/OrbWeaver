// backends/kit/cache-control — directive spelling and shared conversational placement. The prefix policy
// bridge reads the same resolver as SHAPE, preview and backend delivery; generic capability flags do not
// invent an unsupported route's cache protocol.
// Also `explicitCachePlan`: the connection's prompt-cache settings × the request's depth → the turn's plan
// (the wire bytes per setting are pinned in the two hosted runners' chat tests).

import type { GenerationCapability, PromptCacheSettings } from "@orb/contracts/inference";
import { modelIdSchema, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import {
  computeCacheBreakpointPlacements,
  explicitCachePlan,
  placeExplicitCacheMarkers,
  preservesCacheBlockEnds,
} from "../../../../packages/inference/src/backends/kit/cache-control.ts";
import { providerLogger } from "../../../../packages/inference/src/backends/kit/provider-log.ts";
import { resolveCachePolicy } from "../../../../packages/inference/src/funnel/resolve-cache.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { testProviderId } from "../../../support/inference-identities.ts";
import { fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";

function generationOf(explicitPromptCache: boolean): GenerationCapability {
  const capability = generationCapability({
    turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache },
  });
  if (capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return capability.generation;
}

const facts = (model: string): ReturnType<typeof fakeResolved> =>
  fakeResolved({ task: "chat", providerId: testProviderId("openrouter"), model, capability: generationCapability({}) });

test("admitted OpenRouter Anthropic controls preserve stored block ends", () => {
  expect(preservesCacheBlockEnds(facts("claude-sonnet-5"), generationOf(true), {})).toBe(true);
  expect(preservesCacheBlockEnds(facts("anthropic/claude-opus-4.5"), generationOf(true), {})).toBe(true);
});

test("the capability fact alone decides for an Anthropic model: no explicit caching, no split", () => {
  expect(preservesCacheBlockEnds(facts("claude-sonnet-5"), generationOf(false), {})).toBe(false);
});

test("a generic explicit flag without an admitted protocol never preserves cache block ends", () => {
  expect(preservesCacheBlockEnds(facts("google/gemini-3-pro"), generationOf(true), {})).toBe(false);
  expect(preservesCacheBlockEnds(facts("some-org/claude-fork"), generationOf(true), {})).toBe(false);
});

const planFor = (promptCache: PromptCacheSettings, requestedDepth: number | undefined): ReturnType<typeof explicitCachePlan> =>
  explicitCachePlan(
    resolveCachePolicy({
      context: {
        wire: "anthropic-messages",
        dialect: null,
        factsModel: modelIdSchema.parse("claude-sonnet-5"),
        promptSettings: promptCache,
        responseReplaySupported: false,
        configuredReplay: {},
        configuredRetention: { owned: false, value: null },
      },
      generation: generationOf(true),
      requestedDepth,
    }).plan,
  );

test("the shipped settings plan today's wire: a 1h directive, the system block cached, the request's depth as-is", () => {
  expect(planFor(SHIPPED_PROMPT_CACHE, 2)).toEqual({ directive: { type: "ephemeral", ttl: "1h" }, cacheSystem: true, historyDepth: 2 });
});

test("caching off plans nothing at all", () => {
  expect(planFor({ ...SHIPPED_PROMPT_CACHE, enabled: false }, 2)).toBeNull();
});

test("the user depth is a minimum over the request's depth, and adds no history breakpoint the request did not ask for", () => {
  expect(planFor({ ...SHIPPED_PROMPT_CACHE, historyDepth: 5 }, 2)?.historyDepth).toBe(5);
  expect(planFor({ ...SHIPPED_PROMPT_CACHE, historyDepth: 1 }, 4)?.historyDepth).toBe(4);
  expect(planFor({ ...SHIPPED_PROMPT_CACHE, historyDepth: 5 }, undefined)?.historyDepth).toBeUndefined();
});

test("a stored ttl off the allowlist is stripped to the bare 5m directive and said out loud", () => {
  // The column is typed, not re-parsed on read: a hand-edited row is the case the guard exists for. Every other
  // field stays the typed shipped value; only the ttl is written past the type, as the hand edit does.
  const stored: PromptCacheSettings = { ...SHIPPED_PROMPT_CACHE };
  Reflect.set(stored, "ttl", "9z");
  const resolved = resolveCachePolicy({
    context: {
      wire: "anthropic-messages",
      dialect: null,
      factsModel: modelIdSchema.parse("claude-sonnet-5"),
      promptSettings: stored,
      responseReplaySupported: false,
      configuredReplay: {},
      configuredRetention: { owned: false, value: null },
    },
    generation: generationOf(true),
    requestedDepth: 1,
  });
  expect(explicitCachePlan(resolved.plan)?.directive).toEqual({ type: "ephemeral" });
  expect(resolved.warnings.map((warning) => warning.message)).toEqual(["Invalid prefix retention was not sent; the provider's five-minute default applies"]);
});

// The cached prefix is counted once. When the wire rows already open with the static system row, its tokens are
// in `rows[0]`; adding `systemStaticTokens` again would place a history breakpoint under the real minimum, where
// Anthropic silently caches nothing.
test("a history breakpoint's prefix counts the static system block once", () => {
  const conversation = [
    { role: "user", toolExchange: false, tokens: 300 },
    { role: "assistant", toolExchange: false, tokens: 50 },
    { role: "user", toolExchange: false, tokens: 50 },
  ] as const;
  const withSystemRow = computeCacheBreakpointPlacements({
    rows: [{ role: "system", toolExchange: false, tokens: 600 }, ...conversation],
    systemStaticTokens: 600,
    depthFromEnd: 1,
    cacheMinTokens: 1000,
  });
  // 600 system + 300 + 50 = 950 below the 1000 minimum: nothing may be placed.
  expect(withSystemRow).toEqual([]);

  const withTopLevelSystem = computeCacheBreakpointPlacements({
    rows: conversation,
    systemStaticTokens: 700,
    depthFromEnd: 1,
    cacheMinTokens: 1000,
  });
  // CONTROL: the system block travels outside the rows, so its tokens still count: 700 + 300 + 50 = 1050.
  expect(withTopLevelSystem).toEqual([{ depth: 1, index: 1 }]);
});

test("fixed retention and unsplittable dynamic system produce explicit warnings without moving content", () => {
  const events: string[] = [];
  const record = (_fields: Readonly<Record<string, unknown>>, message: string): void => {
    events.push(message);
  };
  const log = providerLogger({ debug: record, info: record, warn: record, error: record }, "openai-compat", "openrouter");
  const generation = {
    ...generationOf(true),
    turns: {
      ...generationOf(true).turns,
      assistantPrefill: false,
      midConversationSystem: false,
      historySystemRows: false,
      roleHandlingFloor: "strict" as const,
      explicitPromptCache: true,
      fixedCacheTtl: "5m" as const,
    },
  };
  const resolved = resolveCachePolicy({
    context: {
      wire: "openai-compat",
      dialect: "openrouter",
      factsModel: modelIdSchema.parse("google/gemini-3-pro"),
      promptSettings: SHIPPED_PROMPT_CACHE,
      responseReplaySupported: true,
      configuredReplay: {},
      configuredRetention: { owned: false, value: null },
    },
    generation,
  });
  const plan = explicitCachePlan(resolved.plan);
  expect(plan?.directive).toEqual({ type: "ephemeral", ttl: "5m" });
  const rows = [{ role: "system", text: "Static\n\nDynamic", toolExchange: false }];
  expect(placeExplicitCacheMarkers({ plan, rows, staticSystem: "Static", generation: generationOf(true), log }).patches.size).toBe(0);
  expect(rows).toEqual([{ role: "system", text: "Static\n\nDynamic", toolExchange: false }]);
  expect(resolved.warnings[0]?.message).toContain("saved 1h setting was not applied");
  expect(events).toEqual(["provider.cache_system_dynamic"]);
});
