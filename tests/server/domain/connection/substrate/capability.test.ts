// resolveCapability — the substrate mediator over the catalog factory. Proves it threads the matching OR
// catalog entry from the passed-in cache into the synthesis arm (and falls to the baseline when absent).

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { describe } from "vitest";
import { resolveCapability } from "../../../../../packages/server/src/domain/connection/substrate/capability.ts";
import { expect, test } from "../../../../support/fixtures";

const gpt5: ModelCatalogEntry = {
  id: "openai/gpt-5",
  name: "GPT-5",
  contextLength: 256_000,
  promptPrice: null,
  completionPrice: null,
  cacheReadPrice: null,
  cacheWritePrice: null,
  inputModalities: ["text"],
  supportedParameters: ["temperature", "top_k"],
};

describe("resolveCapability (mediator)", () => {
  test("threads the matching cache entry into the OR synthesis (window + per-knob ranges)", () => {
    const cap = resolveCapability("openai/gpt-5", "openrouter", "chat-completions", {
      cached: [gpt5],
      agentSdkModels: null,
    });
    expect(cap.context.window).toBe(256_000);
    expect(cap.sampling.topK).toEqual({ min: 0, max: 200 });
  });

  test("falls to the baseline when the model is absent from the cache", () => {
    const cap = resolveCapability("ghost/model", "openrouter", "chat-completions", {
      cached: [gpt5],
      agentSdkModels: null,
    });
    expect(cap.context.window).toBe(200_000); // OR default (no entry)
    expect(cap.sampling.temperature).toEqual({ min: 0, max: 2 });
  });
});
