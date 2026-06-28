// backends/openrouter responses — the Responses-API wire shaping (assistant-first input guard, the
// effort×maxTokens XOR, the Anthropic top-level cacheControl, the non-Anthropic promptCacheKey), the
// stream reduce (text + reasoning deltas), and the usage/finish mapping. The SDK client is a hand-built
// fake (plain event objects); clock injected.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { OpenRouterChatRequest } from "@orb/server/infra/providers";
import { runResponsesTurn } from "@orb/server/infra/providers/backends/openrouter";
import { describe, expect, test, vi } from "vitest";

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
    beta: {
      responses: {
        send: (req): Promise<unknown> => {
          captured.body = req.responsesRequest;
          return Promise.resolve(streamOf(events));
        },
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
    await runResponsesTurn(
      anthropic.client,
      makeRequest({ model: castId<ModelId>(ANTHROPIC_MODEL) }),
      DEPS,
    );
    expect(anthropic.captured.body?.["cacheControl"]).toEqual({ type: "ephemeral" });
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

  test("surfaces a resolve-chat dropped knob as a `warning` event (in events AND via onEvent)", async () => {
    const { client } = streamingClient(OK_EVENTS);
    const onEvent = vi.fn();
    // CAPABILITY exposes no temperature range → resolve-chat drops it + warns.
    const result = await runResponsesTurn(
      client,
      makeRequest({ params: { effort: "high", temperature: 0.5 }, onEvent }),
      DEPS,
    );
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
    const { client } = streamingClient([
      { type: "response.failed", response: { error: { code: "server_error", message: "boom" } } },
    ]);
    await expect(runResponsesTurn(client, makeRequest(), DEPS)).rejects.toMatchObject({
      name: "ProviderError",
    });
  });
});
