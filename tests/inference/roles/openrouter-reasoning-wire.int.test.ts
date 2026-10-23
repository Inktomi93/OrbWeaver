// @subject packages/inference/src/backends/openai-compat/reasoning.ts
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { RecordedRequest } from "../conformance/transport.fixtures.ts";
import { recordRequest } from "../conformance/transport.fixtures.ts";
import { createRuntimeRoot, generationCapability, wireConnection } from "./runtime.fixtures.ts";

const ITEM = { systemPrompt: "Summarize.", userPrompt: "A long scene." } as const;

function openRouterServer(recorded: RecordedRequest[]): typeof fetch {
  return async (input, init): Promise<Response> => {
    const captured = await recordRequest(input, init);
    recorded.push(captured);
    const usage = { ["prompt_tokens"]: 10, ["completion_tokens"]: 5, ["total_tokens"]: 15 };
    if (captured.body["stream"] === true) {
      const chunk = (choice: Record<string, unknown>, withUsage: boolean): string =>
        `data: ${JSON.stringify({ id: "gen-wire", object: "chat.completion.chunk", created: 1, model: "m", choices: [choice], ...(withUsage ? { usage } : {}) })}\n\n`;
      const text =
        chunk({ index: 0, delta: { role: "assistant", content: "ok" }, ["finish_reason"]: null }, false) +
        chunk({ index: 0, delta: {}, ["finish_reason"]: "stop" }, true);
      return new Response(`${text}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({
      id: "gen-wire",
      object: "chat.completion",
      created: 1,
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, ["finish_reason"]: "stop" }],
      usage,
    });
  };
}

test("an OpenRouter side-generation spells an explicit off as effort none on the wire", async () => {
  const recorded: RecordedRequest[] = [];
  await using root = await createRuntimeRoot({ providerFetch: openRouterServer(recorded) });
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
  await using root = await createRuntimeRoot({ providerFetch: openRouterServer(recorded) });
  const capability = generationCapability({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] } });
  await root.app.runtime.executor.summarize({
    connection: await wireConnection(root, { task: "summarize", providerId: "openrouter", model: "anthropic/claude-sonnet-5", capability }),
    inputs: [ITEM],
    effort: "high",
    maxTokens: 128,
  });
  expect(recorded[0]?.body["reasoning"]).toEqual({ effort: "high" });
});
