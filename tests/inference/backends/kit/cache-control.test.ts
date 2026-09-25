// backends/kit/cache-control — `cachesByAnthropicMarkers`, the one answer chat's SHAPE and the openai-compat body
// both read before they keep a same-role run's rows apart. It reads the resolved capability and the model family,
// never the route, so a non-Anthropic model keeps today's joined, unfolded wire even if its cell claims caching.
// Also `anthropicCachePlan`: the connection's prompt-cache settings × the request's depth → the turn's plan
// (the wire bytes per setting are pinned in the two hosted runners' chat tests).

import type { GenerationCapability, PromptCacheSettings } from "@orb/contracts/inference";
import { modelIdSchema, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { anthropicCachePlan, cachesByAnthropicMarkers } from "../../../../packages/inference/src/backends/kit/cache-control.ts";
import type { ProviderLogger } from "../../../../packages/inference/src/backends/kit/provider-log.ts";
import { providerLogger } from "../../../../packages/inference/src/backends/kit/provider-log.ts";
import { expect, test } from "../../../support/fixtures.ts";
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

const facts = (model: string): { readonly factsModel: ReturnType<typeof modelIdSchema.parse> } => ({ factsModel: modelIdSchema.parse(model) });

test("an Anthropic model whose capability places explicit caching keeps rows apart, on any route", () => {
  expect(cachesByAnthropicMarkers(facts("claude-sonnet-5"), generationOf(true))).toBe(true);
  expect(cachesByAnthropicMarkers(facts("anthropic/claude-opus-4.5"), generationOf(true))).toBe(true);
});

test("the capability fact alone decides for an Anthropic model: no explicit caching, no split", () => {
  expect(cachesByAnthropicMarkers(facts("claude-sonnet-5"), generationOf(false))).toBe(false);
});

test("a non-Anthropic model never keeps rows apart, even when its cell claims explicit caching", () => {
  expect(cachesByAnthropicMarkers(facts("google/gemini-3-pro"), generationOf(true))).toBe(false);
  expect(cachesByAnthropicMarkers(facts("some-org/claude-fork"), generationOf(true))).toBe(false);
});

const planFor = (promptCache: PromptCacheSettings, requestedDepth: number | undefined, log?: ProviderLogger): ReturnType<typeof anthropicCachePlan> =>
  anthropicCachePlan({ connection: { promptCache }, requestedDepth, log });

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
  const events: string[] = [];
  const record = (_fields: Readonly<Record<string, unknown>>, message: string): void => {
    events.push(message);
  };
  const log = providerLogger({ debug: record, info: record, warn: record, error: record }, "anthropic-messages", "anthropic");
  // The column is typed, not re-parsed on read: a hand-edited row is the case the guard exists for.
  const stored = { ...SHIPPED_PROMPT_CACHE, ttl: "9z" } as unknown as PromptCacheSettings;
  expect(planFor(stored, 1, log)?.directive).toEqual({ type: "ephemeral" });
  expect(events).toEqual(["provider.cache_ttl_rejected"]);
});
