// @subject packages/inference/src/backends/openai-compat/reasoning.ts
import { expect, test } from "@orb/testkit/node";
import type { RecordedRequest } from "@orb/testkit/node/helpers";
import { openAiServer } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { createRuntimeRoot, generationCapability, wireConnection } from "./runtime.fixtures.ts";

const ITEM = { systemPrompt: "Summarize.", userPrompt: "A long scene." } as const;

test("an OpenRouter side-generation spells an explicit off as effort none on the wire", async () => {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => ({}));
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const capability = generationCapability({ reasoning: { mode: "budget", enabled: true, effortLevels: ["high"] } });
  await root.app.runtime.executor.summarize({
    signal: new AbortController().signal,
    connection: await wireConnection(root, { task: "summarize", providerId: "openrouter", model: "vendor/budget-model", capability }),
    inputs: [ITEM],
    effort: "none",
    maxTokens: 128,
  });
  expect(recorded[0]?.body["reasoning"]).toEqual({ effort: "none" });
});

test("an OpenRouter side-generation on an adaptive model sends the chosen effort verbatim", async () => {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => ({}));
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const capability = generationCapability({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] } });
  await root.app.runtime.executor.summarize({
    signal: new AbortController().signal,
    connection: await wireConnection(root, { task: "summarize", providerId: "openrouter", model: "anthropic/claude-sonnet-5", capability }),
    inputs: [ITEM],
    effort: "high",
    maxTokens: 128,
  });
  expect(recorded[0]?.body["reasoning"]).toEqual({ effort: "high" });
});

test("an OpenRouter adaptive row's max effort reaches the wire although the provider's own types forbid it", async () => {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => ({}));
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const capability = generationCapability({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high", "max"] } });
  await root.app.runtime.executor.summarize({
    signal: new AbortController().signal,
    connection: await wireConnection(root, { task: "summarize", providerId: "openrouter", model: "anthropic/claude-sonnet-5", capability }),
    inputs: [ITEM],
    effort: "max",
    maxTokens: 128,
  });
  // `max` has no member in the installed provider's typed effort union; it survives because the block is spread
  // into the body verbatim. If this ever reads `xhigh`, the provider started validating — see reasoning.ts.
  expect(recorded[0]?.body["reasoning"]).toEqual({ effort: "max" });
});

// §8.8's `carryReasoning: "conversation"` replay. The OR provider re-validates the `reasoning_details` list it
// emitted and DROPS an entry whose signature is missing, so the round-trip is the contract: the exact bytes a
// prior turn recorded under `meta.openrouter.reasoningDetails` must reach the next request body. Asserted at
// the wire, not on the prompt function, so a part that never gets an option is caught here.
const SIGNED_REASONING_DETAIL = {
  type: "reasoning.text",
  text: "Weighing it.",
  signature: "sig-fixture",
  format: "anthropic-claude-v1",
} as const;
const USER_LINE = { role: "user" as const, content: [{ type: "text" as const, text: "Hello." }] };
const CONTINUE_LINE = { role: "user" as const, content: [{ type: "text" as const, text: "Continue." }] };
const REASONED_ASSISTANT = {
  role: "assistant" as const,
  content: [
    { type: "text" as const, text: "Done." },
    { type: "reasoning" as const, text: "Weighing it.", meta: { openrouter: { reasoningDetails: [SIGNED_REASONING_DETAIL] } } },
  ],
};

test("a replayed assistant reasoning part carries its OpenRouter reasoning_details back to the wire verbatim", async () => {
  const recorded: RecordedRequest[] = [];
  using server = openAiServer(recorded, () => ({}));
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5",
    capability: generationCapability({ reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] } }),
  });
  await root.app.runtime.executor.runChatTurn({
    api: "chat-completions",
    connection,
    signal: new AbortController().signal,
    params: {},
    systemPrompt: { static: "You are a fixture.", dynamic: "" },
    history: [USER_LINE, REASONED_ASSISTANT, CONTINUE_LINE],
  });
  const messages = z.array(z.record(z.string(), z.unknown())).parse(recorded[0]?.body["messages"]);
  const assistant = messages.find((message) => message["role"] === "assistant");
  // The provider's own spelling of a replayed thinking turn: the text part as `content`, the thinking as
  // `reasoning`, and the recorded list byte-for-byte as `reasoning_details`.
  expect(assistant).toEqual({
    role: "assistant",
    content: "Done.",
    reasoning: "Weighing it.",
    ["reasoning_details"]: [SIGNED_REASONING_DETAIL],
  });
});
