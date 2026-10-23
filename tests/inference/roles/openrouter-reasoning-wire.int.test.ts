// @subject packages/inference/src/backends/openai-compat/reasoning.ts
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { openAiServer } from "@orb/testkit/node/helpers";
import { createRuntimeRoot, generationCapability, wireConnection } from "./runtime.fixtures.ts";

const ITEM = { systemPrompt: "Summarize.", userPrompt: "A long scene." } as const;

test("an OpenRouter side-generation spells an explicit off as effort none on the wire", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({})) });
  const capability = generationCapability({ reasoning: { mode: "budget", enabled: true, effortLevels: ["high"] } });
  await root.app.runtime.executor.summarize({
    connection: await wireConnection(root, { task: "summarize", providerId: "openrouter", model: "vendor/budget-model", capability }),
    inputs: [ITEM],
    effort: "none",
    maxTokens: 128,
  });
  expect(recorded[0]?.body["reasoning"]).toEqual({ effort: "none" });
});

test("an OpenRouter side-generation on an adaptive model sends the chosen effort verbatim", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openAiServer(recorded, () => ({})) });
  const capability = generationCapability({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] } });
  await root.app.runtime.executor.summarize({
    connection: await wireConnection(root, { task: "summarize", providerId: "openrouter", model: "anthropic/claude-sonnet-5", capability }),
    inputs: [ITEM],
    effort: "high",
    maxTokens: 128,
  });
  expect(recorded[0]?.body["reasoning"]).toEqual({ effort: "high" });
});
