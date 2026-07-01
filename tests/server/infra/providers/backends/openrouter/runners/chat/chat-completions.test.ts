// biome-ignore-all lint/style/useNamingConvention: snake_case customParameters fixtures (top_a) are the
// real OpenRouter wire — a preset's escape-hatch passthrough.
//
// backends/openrouter chat-completions — the wire shaping (Anthropic per-block system cache + the rolling
// history breakpoint + the provider-routing pin), the sampling/reasoning projection, the customParameters
// overlay (owned wins), the SDK→kit stream reshape + usage/cost mapping, the pre-commit retry, the
// mandatory-reasoning strip-and-replay, and HTTP error classification. The SDK client is a hand-built fake
// (plain wire-shaped objects — the runner's own type-guard narrows the stream); clock + jitter injected.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { OpenRouterChatRequest } from "@orb/server/infra/providers";
import {
  placeHistoryCacheBreakpoint,
  runChatCompletionTurn,
} from "@orb/server/infra/providers/backends/openrouter";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../../../support/fixtures";

const FIXED_NOW = 1000;
const ANTHROPIC_MODEL = "anthropic/claude-opus-4-5";
const OPENAI_MODEL = "openai/gpt-5";
const CACHE_MIN = 1024;
const DEPS = { now: (): number => FIXED_NOW, random: (): number => 0.5 };

// The runner now consumes `resolve-chat`'s GATED sampling, so the capability must expose the ranges for
// any knob the wire-shaping tests expect to survive (a knob with no range is dropped — see resolve-chat).
const CAPABILITY: ModelCapability = {
  reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "high"] },
  sampling: { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 } },
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
};

const CRED = {
  source: "openrouter",
  apiKey: "sk-or-secret",
  credentialId: null,
} as unknown as ResolvedCredential;

type ChatClient = Parameters<typeof runChatCompletionTurn>[0];

function makeRequest(overrides: Partial<OpenRouterChatRequest> = {}): OpenRouterChatRequest {
  const base: OpenRouterChatRequest = {
    api: "chat-completions",
    credential: CRED,
    model: castId<ModelId>(ANTHROPIC_MODEL),
    capability: CAPABILITY,
    params: { temperature: 0.7, effort: "high" },
    systemPrompt: { static: "You are a bot.", dynamic: "Be terse." },
    history: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
  };
  return { ...base, ...overrides };
}

// A wire-shaped stream chunk (only the fields the reshaper reads are meaningful). Plain objects — the
// runner narrows the stream through its own type-guard, so no SDK types are imported here.
function chunk(partial: Record<string, unknown>): Record<string, unknown> {
  return { choices: [], created: 0, id: "gen-1", model: ANTHROPIC_MODEL, ...partial };
}

async function* streamOf(chunks: readonly Record<string, unknown>[]): AsyncGenerator<unknown> {
  await Promise.resolve(); // make this a genuine async iterable (the reducer awaits the stream)
  for (const c of chunks) {
    yield c;
  }
}

interface Captured {
  chatRequest: Record<string, unknown> | undefined;
}

// A fake chat client whose `send` streams the given chunks and records the request body it was handed.
function streamingClient(chunks: readonly Record<string, unknown>[]): {
  client: ChatClient;
  captured: Captured;
} {
  const captured: Captured = { chatRequest: undefined };
  const client: ChatClient = {
    chat: {
      send: (req): Promise<unknown> => {
        captured.chatRequest = req.chatRequest;
        return Promise.resolve(streamOf(chunks));
      },
    },
  };
  return { client, captured };
}

const OK_STREAM: readonly Record<string, unknown>[] = [
  chunk({ choices: [{ delta: { content: "Hello" }, finishReason: null, index: 0 }] }),
  chunk({
    choices: [{ delta: {}, finishReason: "stop", index: 0 }],
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cost: 0.002,
      costDetails: {
        upstreamInferenceCost: 0.002,
        upstreamInferencePromptCost: 0.001,
        upstreamInferenceCompletionsCost: 0.001,
      },
      promptTokensDetails: { cachedTokens: 8 },
      completionTokensDetails: { reasoningTokens: 2 },
      isByok: false,
    },
  }),
];

// Read the assembled `messages[0]` (the system message) off a captured request, leniently.
function systemMessage(captured: Captured): { content: unknown } {
  const messages = captured.chatRequest?.["messages"];
  const first = Array.isArray(messages) ? messages[0] : undefined;
  return first as { content: unknown };
}

describe("runChatCompletionTurn — wire shaping", () => {
  test("Anthropic: per-block cache_control on the static system block + the Anthropic provider pin", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, makeRequest(), DEPS);
    const content = systemMessage(captured).content;
    expect(Array.isArray(content)).toBe(true);
    const blocks = Array.isArray(content) ? content : [];
    expect(blocks[0]).toEqual({
      type: "text",
      text: "You are a bot.",
      cacheControl: { type: "ephemeral" },
    });
    expect(blocks[1]).toEqual({ type: "text", text: "Be terse." });
    expect(captured.chatRequest?.["provider"]).toEqual({ order: ["Anthropic"] });
  });

  test("non-Anthropic: the system prompt collapses to a string + no provider pin", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(
      client,
      makeRequest({ model: castId<ModelId>(OPENAI_MODEL) }),
      DEPS,
    );
    expect(systemMessage(captured).content).toBe("You are a bot.\n\nBe terse.");
    expect(captured.chatRequest?.["provider"]).toBeUndefined();
  });

  test("projects sampling + reasoning effort; customParameters overlay loses to runner-owned fields", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(
      client,
      makeRequest({
        params: { temperature: 0.3, effort: "low", topP: 0.9 },
        customParameters: { model: "evil/override", top_a: 0.5 },
      }),
      DEPS,
    );
    expect(captured.chatRequest?.["temperature"]).toBe(0.3);
    expect(captured.chatRequest?.["topP"]).toBe(0.9);
    expect(captured.chatRequest?.["reasoning"]).toEqual({ effort: "low" });
    expect(captured.chatRequest?.["model"]).toBe(ANTHROPIC_MODEL);
    expect(captured.chatRequest?.["top_a"]).toBe(0.5);
  });

  test("disables OpenRouter middle-out by default via the context-compression plugin", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, makeRequest(), DEPS);
    expect(captured.chatRequest?.["plugins"]).toEqual([
      { id: "context-compression", enabled: false },
    ]);
  });

  test("surfaces a resolve-chat dropped knob as a `warning` event (in events AND via onEvent)", async () => {
    const { client } = streamingClient(OK_STREAM);
    const onEvent = vi.fn();
    // CAPABILITY exposes no `seed` flag → resolve-chat drops it + warns.
    const result = await runChatCompletionTurn(
      client,
      makeRequest({ params: { effort: "high", seed: 5 }, onEvent }),
      DEPS,
    );
    const warnings = result.events.filter((e) => e.kind === "warning");
    expect(warnings).toEqual([
      {
        kind: "warning",
        at: FIXED_NOW,
        code: "sampling_knob_dropped",
        message: "seed ignored: model does not support seed",
      },
    ]);
    expect(onEvent).toHaveBeenCalledWith(warnings[0]);
  });
});

describe("runChatCompletionTurn — stream reduce → ChatResult", () => {
  test("maps reply, finish reason, and the full usage/cost accounting", async () => {
    const { client } = streamingClient(OK_STREAM);
    const result = await runChatCompletionTurn(client, makeRequest(), DEPS);
    expect(result.reply).toBe("Hello");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.tokensIn).toBe(10);
    expect(result.usage.tokensOut).toBe(5);
    expect(result.usage.cacheReadTokens).toBe(8);
    expect(result.usage.reasoningTokens).toBe(2);
    expect(result.usage.costUsd).toBe(0.002);
    expect(result.usage.costDetails).toEqual({
      totalUsd: 0.002,
      promptUsd: 0.001,
      completionUsd: 0.001,
    });
    expect(result.usage.isByok).toBe(false);
    expect(result.usage.contextWindow).toBe(200_000);
  });

  test("prefers the structured reasoningDetails channel over the legacy string (no Opus-4.8 doubling)", async () => {
    const { client } = streamingClient([
      chunk({
        choices: [
          {
            delta: {
              content: "x",
              reasoning: "DUP",
              reasoningDetails: [{ type: "reasoning.text", text: "thinking" }],
            },
            finishReason: "stop",
            index: 0,
          },
        ],
      }),
    ]);
    const result = await runChatCompletionTurn(client, makeRequest(), DEPS);
    expect(result.reasoning).toBe("thinking");
    expect(result.reasoning).not.toContain("DUP");
  });
});

describe("runChatCompletionTurn — retry + error classification", () => {
  test("pre-commit retry: a 429 on the first attempt recovers on the second", async () => {
    let attempts = 0;
    const client: ChatClient = {
      chat: {
        send: (): Promise<unknown> => {
          attempts += 1;
          if (attempts === 1) {
            return Promise.reject(Object.assign(new Error("rate limited"), { statusCode: 429 }));
          }
          return Promise.resolve(streamOf(OK_STREAM));
        },
      },
    };
    const result = await runChatCompletionTurn(client, makeRequest(), {
      now: () => FIXED_NOW,
      random: () => 0,
    });
    expect(attempts).toBe(2);
    expect(result.reply).toBe("Hello");
  });

  test("a 401 surfaces as a typed auth_failed ProviderError", async () => {
    const client: ChatClient = {
      chat: {
        send: (): Promise<unknown> =>
          Promise.reject(Object.assign(new Error("bad key"), { statusCode: 401 })),
      },
    };
    await expect(runChatCompletionTurn(client, makeRequest(), DEPS)).rejects.toMatchObject({
      kind: "auth_failed",
      retryable: false,
    });
  });

  test("mandatory-reasoning endpoint: an effort:none 400 strips reasoning and replays ONCE", async () => {
    const seen: (Record<string, unknown> | undefined)[] = [];
    let attempts = 0;
    const client: ChatClient = {
      chat: {
        send: (req): Promise<unknown> => {
          attempts += 1;
          seen.push(req.chatRequest);
          if (attempts === 1) {
            return Promise.reject(
              Object.assign(new Error("reasoning is mandatory for this model"), {
                statusCode: 400,
              }),
            );
          }
          return Promise.resolve(streamOf(OK_STREAM));
        },
      },
    };
    const result = await runChatCompletionTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, reasoning: { mode: "effort", enabled: true } },
        params: { effort: "none" },
      }),
      DEPS,
    );
    expect(attempts).toBe(2);
    expect(seen[0]?.["reasoning"]).toEqual({ effort: "none" });
    expect(seen[1]?.["reasoning"]).toBeUndefined();
    expect(result.reply).toBe("Hello");
  });
});

describe("the history cache breakpoint placement", () => {
  // ~7500 chars ⇒ well over the token floor (estimateTokens ≈ chars/4).
  const longText = "word ".repeat(1500);

  function asMessages(
    items: { role: string; content: string }[],
  ): Parameters<typeof placeHistoryCacheBreakpoint>[0] {
    return items as unknown as Parameters<typeof placeHistoryCacheBreakpoint>[0];
  }

  test("converts the targeted message into a cache_control block when the prefix clears the floor", () => {
    const placed = placeHistoryCacheBreakpoint(
      asMessages([
        { role: "user", content: longText },
        { role: "assistant", content: "ok" },
      ]),
      "",
      1,
      CACHE_MIN,
    );
    expect(Array.isArray(placed[0]?.content)).toBe(true);
  });

  test("leaves the array unchanged when the prefix is below the floor", () => {
    const placed = placeHistoryCacheBreakpoint(
      asMessages([{ role: "user", content: "tiny" }]),
      "",
      0,
      CACHE_MIN,
    );
    expect(placed[0]?.content).toBe("tiny");
  });

  test("leaves the array unchanged when the offset is out of range", () => {
    const messages = asMessages([{ role: "user", content: longText }]);
    expect(placeHistoryCacheBreakpoint(messages, "", 5, CACHE_MIN)).toBe(messages);
  });
});
