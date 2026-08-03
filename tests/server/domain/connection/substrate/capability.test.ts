// resolveCapability — the substrate mediator over the catalog factory. Proves it threads the matching OR
// catalog entry from the passed-in cache into the synthesis arm (and falls to the baseline when absent), and
// the cached agent-sdk daemon rows into the max-pro-sub family→version arm.

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { describe } from "vitest";
import { resolveCapability } from "../../../../../packages/server/src/domain/connection/substrate/capability.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeAgentSdkModel } from "../_support.ts";

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

  // The agent-sdk daemon arm — re-homed from the deleted getModelCapability verb's cold-cache regression
  // (AU-5). A bare family alias is NOT a curated shortlist id, so its reasoning profile comes from the cached
  // daemon rows; a COLD cache used to degrade it to the conservative no-reasoning profile (the bug the
  // snapshot boot-seed + enlarged TTL fixed — those halves are pinned by get-agent-sdk-catalog.int.test.ts
  // and agent-sdk-model-cache.test.ts). This pins the mediator half: warm rows ⇒ the daemon's real profile.
  test("threads the cached daemon rows into the max-pro-sub alias arm (adaptive thinking)", () => {
    const cap = resolveCapability("sonnet", "max-pro-sub", "agent-sdk", {
      cached: null,
      agentSdkModels: [makeAgentSdkModel({ alias: "sonnet", resolvedModel: "claude-sonnet-5", supportsAdaptiveThinking: true })],
    });
    expect(cap.reasoning.mode).toBe("adaptive");
  });

  test("a cold daemon cache degrades the alias to the conservative no-reasoning profile (never a fabricated one)", () => {
    const cap = resolveCapability("sonnet", "max-pro-sub", "agent-sdk", { cached: null, agentSdkModels: null });
    expect(cap.reasoning.mode).toBe("none");
  });
});
