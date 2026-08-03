// backends/openrouter responses — the Responses-API wire shaping (assistant-first input guard, the
// effort×maxTokens XOR, the Anthropic top-level cacheControl, the non-Anthropic promptCacheKey), the
// stream reduce (text + reasoning deltas), and the usage/finish mapping. The SDK client is a hand-built
// fake (plain event objects); clock injected.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { OpenRouterChatRequest } from "@orb/server/infra/providers";
import { runResponsesTurn } from "@orb/server/infra/providers/backends/openrouter";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../../../support/fixtures.ts";

const FIXED_NOW = 1000;
const ANTHROPIC_MODEL = "anthropic/claude-opus-4-5";
const OPENAI_MODEL = "openai/gpt-5";
const DEPS = { now: (): number => FIXED_NOW, random: (): number => 0.5 };

const CAPABILITY: ModelCapability = {
  reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "high"] },
  sampling: {},
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
};

const CRED = {
  source: "openrouter",
  apiKey: "sk-or-secret",
  credentialId: null,
} as unknown as ResolvedCredential;

type ResponsesClient = Parameters<typeof runResponsesTurn>[0];

function makeRequest(overrides: Partial<OpenRouterChatRequest> = {}): OpenRouterChatRequest {
  const base: OpenRouterChatRequest = {
    api: "responses",
    credential: CRED,
    model: castId<ModelId>(OPENAI_MODEL),
    capability: CAPABILITY,
    params: { effort: "high" },
    systemPrompt: { static: "Sys.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
  };
  return { ...base, ...overrides };
}

async function* streamOf(events: readonly Record<string, unknown>[]): AsyncGenerator<unknown> {
  await Promise.resolve();
  for (const e of events) {
    yield e;
  }
}

interface Captured {
  body: Record<string, unknown> | undefined;
}

function streamingClient(events: readonly Record<string, unknown>[]): {
  client: ResponsesClient;
  captured: Captured;
} {
  const captured: Captured = { body: undefined };
  const client: ResponsesClient = {
    responses: {
      send: (req): Promise<unknown> => {
        captured.body = req.responsesRequest;
        return Promise.resolve(streamOf(events));
      },
    },
  };
  return { client, captured };
}

const OK_EVENTS: readonly Record<string, unknown>[] = [
  { type: "response.output_text.delta", delta: "Hel" },
  { type: "response.output_text.delta", delta: "lo" },
  { type: "response.reasoning_text.delta", delta: "ponder" },
  {
    type: "response.completed",
    response: {
      status: "completed",
      incompleteDetails: null,
      outputText: "Hello",
      output: [],
      usage: {
        inputTokens: 12,
        outputTokens: 4,
        totalTokens: 16,
        cost: 0.003,
        costDetails: {
          upstreamInferenceCost: 0.003,
          upstreamInferenceInputCost: 0.002,
          upstreamInferenceOutputCost: 0.001,
        },
        inputTokensDetails: { cachedTokens: 6 },
        outputTokensDetails: { reasoningTokens: 1 },
        isByok: true,
      },
    },
  },
];

describe("runResponsesTurn — wire shaping", () => {
  test("effort dial → reasoning.effort only (the XOR: never a maxTokens alongside)", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(client, makeRequest(), DEPS);
    const reasoning = captured.body?.["reasoning"];
    expect(reasoning).toMatchObject({ effort: "high", summary: "auto" });
    expect(reasoning).not.toHaveProperty("maxTokens");
  });

  test("verbosity is mapped to text.verbosity — the ONE OR wire with the field (D68-B)", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, verbosity: ["low", "medium", "high"] },
        params: { effort: "high", verbosity: "high" },
      }),
      DEPS,
    );
    expect(captured.body?.["text"]).toEqual({ verbosity: "high" });
  });

  test("verbosity rides ALONGSIDE a json_schema format in the same text block", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, verbosity: ["low", "medium", "high"] },
        params: { effort: "high", verbosity: "low" },
        responseFormat: { name: "out", schema: { type: "object" } },
      }),
      DEPS,
    );
    const text = captured.body?.["text"] as Record<string, unknown>;
    expect(text["verbosity"]).toBe("low");
    expect(text["format"]).toMatchObject({ type: "json_schema", name: "out" });
    // STRICTFMT — the responses wire is the chat-completions wire's sibling and carries the SAME
    // OpenAI-family `strict` landmine: a caller that didn't ask for strict does not get it invented.
    expect(text["format"]).not.toHaveProperty("strict");
  });

  test("STRICTFMT: a caller that ASKS for strict gets it on the responses text.format", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(client, makeRequest({ responseFormat: { name: "out", schema: { type: "object" }, strict: true } }), DEPS);
    expect((captured.body?.["text"] as Record<string, unknown>)["format"]).toMatchObject({ strict: true });
  });

  test("no text block when neither verbosity nor format is set (byte-stable)", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(client, makeRequest(), DEPS);
    expect(captured.body?.["text"]).toBeUndefined();
  });

  // F1 TRUE-WIRE + D41 on the responses arm: captureWire records the SDK-outbound-transformed body (snake_case
  // literal wire), and a non-empty customParameters blob is dropped loudly. Reaches `ResponsesRequest$outboundSchema`
  // through the runner (no direct `@openrouter/sdk` test-root import); fails loudly on an SDK export rename.
  test("captureWire records the TRUE snake_case wire (maxOutputTokens→max_output_tokens); customParameters dropped loudly (F1/D41)", async () => {
    const { client } = streamingClient(OK_EVENTS);
    const wires: Record<string, unknown>[] = [];
    const result = await runResponsesTurn(
      client,
      makeRequest({
        params: { effort: "high", maxOutputTokens: 128 },
        customParameters: { model: "evil/override", foo: "bar" },
      }),
      { ...DEPS, captureWire: (e): void => void wires.push(e.body) },
    );
    const wire = wires.at(0);
    expect(wire?.["max_output_tokens"]).toBe(128);
    expect(wire?.["maxOutputTokens"]).toBeUndefined();
    // customParameters never reached the responses wire (owned model intact; the unknown key stripped).
    expect(wire?.["model"]).toBe(OPENAI_MODEL);
    expect(wire?.["foo"]).toBeUndefined();
    // Dropped-and-loud (D41 no-silent-degrade).
    expect(result.events.filter((e) => e.kind === "warning")).toContainEqual({
      kind: "warning",
      at: FIXED_NOW,
      code: "custom_parameters_ignored",
      message: "customParameters ignored on OpenRouter (BYOK/custom-byo only)",
    });
  });

  test("parallelToolCalls + fallback models[] ride the responses wire (mirrors chat-completions)", async () => {
    const tools = [{ name: "get_weather", description: "weather", parameters: { type: "object" } }];
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(
      client,
      makeRequest({
        tools,
        providerRouting: { models: ["openai/gpt-5", "anthropic/claude-opus-4-5"] },
        params: { effort: "high", advanced: { parallelToolCalls: false } },
      }),
      DEPS,
    );
    expect(captured.body?.["parallelToolCalls"]).toBe(false);
    expect(captured.body?.["models"]).toEqual(["openai/gpt-5", "anthropic/claude-opus-4-5"]);
    expect(captured.body?.["tools"]).toBeDefined();
  });

  test("parallelToolCalls is omitted without a tools[] request (byte-identical to a plain turn)", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(client, makeRequest({ params: { effort: "high", advanced: { parallelToolCalls: false } } }), DEPS);
    expect(captured.body?.["parallelToolCalls"]).toBeUndefined();
  });

  test("toolChoice is emitted INDEPENDENTLY of tools (semantic parity with chat-completions)", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(client, makeRequest({ toolChoice: { mode: "auto" } }), DEPS);
    expect(captured.body?.["toolChoice"]).toBe("auto"); // present even with no tools[]
    expect(captured.body?.["tools"]).toBeUndefined();
  });

  test("maps the already-resolved topK rider onto the responses body (D68 §1)", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, sampling: { topK: { min: 0, max: 100 } } },
        params: { effort: "high", topK: 40 },
      }),
      DEPS,
    );
    expect(captured.body?.["topK"]).toBe(40);
  });

  test("emits the provider.sampling receipt including the applied verbosity", async () => {
    const spy = vi.spyOn(logger, "debug");
    const { client } = streamingClient(OK_EVENTS);
    await runResponsesTurn(
      client,
      makeRequest({
        capability: {
          ...CAPABILITY,
          sampling: { temperature: { min: 0, max: 2 } },
          verbosity: ["low", "medium", "high"],
        },
        params: { effort: "high", temperature: 0.4, verbosity: "medium" },
      }),
      DEPS,
    );
    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.sampling");
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["requested"]).toEqual({ temperature: 0.4, verbosity: "medium" });
    expect(fields["applied"]).toEqual({ temperature: 0.4, verbosity: "medium" });
    expect(fields["dropped"]).toEqual([]);
  });

  test("explicit budget → reasoning.maxTokens only (the XOR: never an effort alongside)", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, reasoning: { mode: "budget", enabled: true } },
        // `effort` is the on-switch (resolve-chat enables reasoning on a real effort); `budget` is the
        // depth — a budget-mode model rides maxTokens, never the effort dial (the XOR).
        params: { effort: "high", thinkingBudgetTokens: 2048 },
      }),
      DEPS,
    );
    const reasoning = captured.body?.["reasoning"];
    expect(reasoning).toMatchObject({ maxTokens: 2048 });
    expect(reasoning).not.toHaveProperty("effort");
  });

  test("Anthropic model → top-level cacheControl; non-Anthropic → a promptCacheKey instead", async () => {
    const anthropic = streamingClient(OK_EVENTS);
    await runResponsesTurn(anthropic.client, makeRequest({ model: castId<ModelId>(ANTHROPIC_MODEL) }), DEPS);
    expect(anthropic.captured.body?.["cacheControl"]).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(anthropic.captured.body?.["promptCacheKey"]).toBeUndefined();

    const openai = streamingClient(OK_EVENTS);
    await runResponsesTurn(openai.client, makeRequest(), DEPS);
    expect(openai.captured.body?.["cacheControl"]).toBeUndefined();
    expect(typeof openai.captured.body?.["promptCacheKey"]).toBe("string");
  });

  test("an assistant-first view gets a placeholder user turn prepended", async () => {
    const { client, captured } = streamingClient(OK_EVENTS);
    await runResponsesTurn(
      client,
      makeRequest({
        history: [
          { role: "assistant", content: [{ type: "text", text: "Greetings" }] },
          { role: "user", content: [{ type: "text", text: "Hi" }] },
        ],
      }),
      DEPS,
    );
    const input = captured.body?.["input"];
    expect(Array.isArray(input)).toBe(true);
    const first = Array.isArray(input) ? input[0] : undefined;
    expect(first).toEqual({ role: "user", content: "" });
  });

  // D41 (findings §4): `function_call_output` has no error slot either, so an isError tool result loses the
  // flag on this dialect too — dropped LOUDLY, never encoded onto a wire with nowhere to put it.
  test("a tool-result isError:true drops loudly as `tool_result_error_dropped` (D41)", async () => {
    const onEvent = vi.fn();
    const { client, captured } = streamingClient(OK_EVENTS);
    const result = await runResponsesTurn(
      client,
      makeRequest({
        history: [
          { role: "user", content: [{ type: "text", text: "go" }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", content: '{"err":"boom"}', isError: true }] },
        ],
        onEvent,
      }),
      DEPS,
    );
    const input = captured.body?.["input"];
    const last = Array.isArray(input) ? input.at(-1) : undefined;
    expect(last).toEqual({ type: "function_call_output", callId: "call_1", output: '{"err":"boom"}' });
    expect(result.events.filter((e) => e.kind === "warning")).toContainEqual({
      kind: "warning",
      at: FIXED_NOW,
      code: "tool_result_error_dropped",
      message: "tool-result isError ignored: the OpenRouter chat wire has no tool-result error field",
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ code: "tool_result_error_dropped" }));
  });

  test("surfaces a resolve-chat dropped knob as a `warning` event (in events AND via onEvent)", async () => {
    const { client } = streamingClient(OK_EVENTS);
    const onEvent = vi.fn();
    // CAPABILITY exposes no temperature range → resolve-chat drops it + warns.
    const result = await runResponsesTurn(client, makeRequest({ params: { effort: "high", temperature: 0.5 }, onEvent }), DEPS);
    const warnings = result.events.filter((e) => e.kind === "warning");
    expect(warnings).toEqual([
      {
        kind: "warning",
        at: FIXED_NOW,
        code: "sampling_knob_dropped",
        message: "temperature ignored: model does not expose a temperature range",
      },
    ]);
    expect(onEvent).toHaveBeenCalledWith(warnings[0]);
  });
});

describe("runResponsesTurn — stream reduce → ChatResult", () => {
  test("accumulates text + reasoning deltas and maps the usage/cost + finish reason", async () => {
    const { client } = streamingClient(OK_EVENTS);
    const result = await runResponsesTurn(client, makeRequest(), DEPS);
    expect(result.reply).toBe("Hello");
    expect(result.reasoning).toBe("ponder");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.tokensIn).toBe(12);
    expect(result.usage.tokensOut).toBe(4);
    expect(result.usage.cacheReadTokens).toBe(6);
    expect(result.usage.reasoningTokens).toBe(1);
    expect(result.usage.costUsd).toBe(0.003);
    expect(result.usage.costDetails).toEqual({
      totalUsd: 0.003,
      promptUsd: 0.002,
      completionUsd: 0.001,
    });
    expect(result.usage.isByok).toBe(true);
  });

  test("a response.failed event becomes a thrown ProviderError", async () => {
    const { client } = streamingClient([{ type: "response.failed", response: { error: { code: "server_error", message: "boom" } } }]);
    await expect(runResponsesTurn(client, makeRequest(), DEPS)).rejects.toMatchObject({
      name: "ProviderError",
    });
  });
});

describe("runResponsesTurn — the tool finish signal (the Responses wire has NO tool finish reason)", () => {
  // A completed tool-calling turn: status:"completed" with function_call OUTPUT items — the calls'
  // presence IS the finish signal (live-proven 2026-07-27; a status-only normalize left the domain
  // recurse loop's finishReason:"tool" pivot dead on this route).
  const toolEvents: readonly Record<string, unknown>[] = [
    {
      type: "response.completed",
      response: {
        status: "completed",
        incompleteDetails: null,
        outputText: "",
        output: [{ type: "function_call", id: "fc_1", callId: "call_1", name: "roll_dice", arguments: '{"sides":20}' }],
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, inputTokensDetails: { cachedTokens: 0 }, outputTokensDetails: { reasoningTokens: 0 } },
      },
    },
  ];

  test("surfaced function_call items force finishReason 'tool'; stopReason keeps the raw provenance", async () => {
    const { client } = streamingClient(toolEvents);
    const result = await runResponsesTurn(client, makeRequest(), DEPS);
    expect(result.finishReason).toBe("tool");
    expect(result.stopReason).toBe("completed");
    expect(result.toolCalls).toEqual([{ toolCallId: "call_1", name: "roll_dice", arguments: '{"sides":20}' }]);
  });

  test("a call-less completed turn stays finishReason 'stop' (no false pivot)", async () => {
    const { client } = streamingClient(OK_EVENTS);
    const result = await runResponsesTurn(client, makeRequest(), DEPS);
    expect(result.finishReason).toBe("stop");
  });
});
