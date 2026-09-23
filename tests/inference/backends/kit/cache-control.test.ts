// backends/kit/cache-control — `cachesByAnthropicMarkers`, the one answer chat's SHAPE and the openai-compat body
// both read before they keep a same-role run's rows apart. It reads the resolved capability and the model family,
// never the route, so a non-Anthropic model keeps today's joined, unfolded wire even if its cell claims caching.

import type { GenerationCapability } from "@orb/contracts/inference";
import { modelIdSchema } from "@orb/contracts/inference";
import { cachesByAnthropicMarkers } from "../../../../packages/inference/src/backends/kit/cache-control.ts";
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
