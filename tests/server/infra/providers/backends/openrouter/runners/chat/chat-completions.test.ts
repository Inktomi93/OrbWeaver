// biome-ignore-all lint/style/useNamingConvention: snake_case fixtures (top_a) are the real OpenRouter wire.
//
// backends/openrouter chat-completions — the wire shaping (Anthropic per-block system cache + the rolling
// history breakpoint + the provider-routing pin), the sampling/reasoning projection, the customParameters
// LOCKOUT (BYOK/custom-byo-only — a preset's escape-hatch blob never reaches the OpenRouter wire), the SDK→kit
// stream reshape + usage/cost mapping, the pre-commit retry, the mandatory-reasoning strip-and-replay, and HTTP
// error classification. The SDK client is a hand-built fake (plain wire-shaped objects — the runner's own
// type-guard narrows the stream); clock + jitter injected.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { OpenRouterChatRequest } from "@orb/server/infra/providers";
import { placeHistoryCacheBreakpoint, runChatCompletionTurn } from "@orb/server/infra/providers/backends/openrouter";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../../../../support/fixtures.ts";

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
      cacheControl: { type: "ephemeral", ttl: "1h" },
    });
    expect(blocks[1]).toEqual({ type: "text", text: "Be terse." });
    // The pin is order + allowFallbacks:false — `order` alone let a turn leak to Bedrock/Azure/Google,
    // every hop a non-caching endpoint that re-bills the prefix (findings §2).
    expect(captured.chatRequest?.["provider"]).toEqual({ order: ["Anthropic"], allowFallbacks: false });
  });

  // Findings §1: 1h is honored on the OR wire with NO anthropic-beta header, and it must survive the SDK's
  // outbound (camelCase→snake_case) transform — the ttl living only on the pre-serialize object would buy
  // nothing. Asserted on the TRUE wire bytes, incl. the rolling history breakpoint blocks.
  test("the 1h cache ttl reaches the TRUE wire on every Anthropic cache block (system + history)", async () => {
    const { client } = streamingClient(OK_STREAM);
    const wires: Record<string, unknown>[] = [];
    const longText = "word ".repeat(1500);
    await runChatCompletionTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, turns: CACHE_TURNS(1024) },
        history: Array.from({ length: 6 }, (_, i) => ({
          role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: [{ type: "text" as const, text: longText }],
        })),
        historyCacheBreakpointFromEnd: 1,
      }),
      { ...DEPS, captureWire: (e): void => void wires.push(e.body) },
    );
    const messages = wires.at(0)?.["messages"] as { content: unknown }[];
    const blocks: Record<string, unknown>[] = messages.flatMap((m) => (Array.isArray(m.content) ? (m.content as Record<string, unknown>[]) : []));
    const cacheBlocks = blocks.filter((b) => b["cache_control"] !== undefined);
    expect(cacheBlocks).toHaveLength(3); // the static system block + the R1 rolling pair
    for (const block of cacheBlocks) {
      expect(block["cache_control"]).toEqual({ type: "ephemeral", ttl: "1h" });
    }
  });

  // D41: `isError` on a tool result has no slot on the chat-completions wire, so the flag is dropped — the
  // model reads a failed tool result as an ordinary one. The drop is LOUD, never silent (findings §4).
  test("a tool-result isError:true drops loudly as `tool_result_error_dropped` (D41)", async () => {
    const onEvent = vi.fn();
    const { client, captured } = streamingClient(OK_STREAM);
    const result = await runChatCompletionTurn(
      client,
      makeRequest({
        history: [
          { role: "user", content: [{ type: "text", text: "go" }] },
          { role: "assistant", content: [{ type: "tool-call", toolCallId: "call_1", name: "tick", arguments: "{}" }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", content: '{"err":"boom"}', isError: true }] },
        ],
        onEvent,
      }),
      DEPS,
    );
    // The flag is genuinely absent from the wire message (nothing invented to carry it).
    const messages = captured.chatRequest?.["messages"] as Record<string, unknown>[];
    expect(messages.at(-1)).toEqual({ role: "tool", toolCallId: "call_1", content: '{"err":"boom"}' });
    expect(result.events.filter((e) => e.kind === "warning")).toContainEqual({
      kind: "warning",
      at: FIXED_NOW,
      code: "tool_result_error_dropped",
      message: "tool-result isError ignored: the OpenRouter chat wire has no tool-result error field",
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ code: "tool_result_error_dropped" }));
  });

  test("a SUCCESSFUL tool result (no isError) emits NO tool_result_error_dropped warning", async () => {
    const { client } = streamingClient(OK_STREAM);
    const result = await runChatCompletionTurn(
      client,
      makeRequest({
        history: [
          { role: "user", content: [{ type: "text", text: "go" }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", content: '{"ok":true}' }] },
        ],
      }),
      DEPS,
    );
    expect(result.events.filter((e) => e.kind === "warning" && e.code === "tool_result_error_dropped")).toEqual([]);
  });

  test("non-Anthropic: the system prompt collapses to a string + no provider pin", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, makeRequest({ model: castId<ModelId>(OPENAI_MODEL) }), DEPS);
    expect(systemMessage(captured).content).toBe("You are a bot.\n\nBe terse.");
    expect(captured.chatRequest?.["provider"]).toBeUndefined();
  });

  test("projects sampling + reasoning effort; customParameters is LOCKED OUT of the OpenRouter wire (BYOK-only)", async () => {
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
    // The owned model is intact — the colliding `model` override never landed.
    expect(captured.chatRequest?.["model"]).toBe(ANTHROPIC_MODEL);
    // Neither the colliding key (`model`) NOR a non-colliding one (`top_a`) reaches the wire: customParameters
    // is not merged on OpenRouter at all (BYOK/custom-byo-only).
    expect(captured.chatRequest?.["top_a"]).toBeUndefined();
  });

  // F1 TRUE-WIRE + D41: the captureWire sink records the SDK-outbound-transformed body (the literal wire), and a
  // non-empty customParameters blob is dropped-and-loud. Reaches the SDK `$outboundSchema` through the runner
  // (never a direct `@openrouter/sdk` test-root import); fails loudly if an SDK bump renames/moves the export.
  test("captureWire records the TRUE snake_case wire (SDK outbound schema); customParameters dropped loudly (F1/D41)", async () => {
    const { client } = streamingClient(OK_STREAM);
    const wires: Record<string, unknown>[] = [];
    const result = await runChatCompletionTurn(
      client,
      makeRequest({
        model: castId<ModelId>(OPENAI_MODEL),
        capability: { ...CAPABILITY, sampling: { ...CAPABILITY.sampling, topA: { min: 0, max: 1 } } },
        params: { temperature: 0.3, effort: "low", topP: 0.9, topA: 0.4, maxOutputTokens: 64 },
        customParameters: { model: "evil/override", top_a: 0.9 },
      }),
      { ...DEPS, captureWire: (e): void => void wires.push(e.body) },
    );
    const wire = wires.at(0);
    // camelCase → snake_case: the SDK outbound schema renamed the runner's owned fields.
    expect(wire?.["max_completion_tokens"]).toBe(64);
    expect(wire?.["top_p"]).toBe(0.9);
    expect(wire?.["top_a"]).toBe(0.4);
    // The camelCase forms are NOT on the true wire.
    expect(wire?.["maxCompletionTokens"]).toBeUndefined();
    expect(wire?.["topP"]).toBeUndefined();
    // customParameters never reached the wire (owned model intact; the colliding override never landed).
    expect(wire?.["model"]).toBe(OPENAI_MODEL);
    // Dropped-and-loud (D41 no-silent-degrade).
    expect(result.events.filter((e) => e.kind === "warning")).toContainEqual({
      kind: "warning",
      at: FIXED_NOW,
      code: "custom_parameters_ignored",
      message: "customParameters ignored on OpenRouter (BYOK/custom-byo only)",
    });
  });

  test("emits the resolved minP as the first-class SDK `minP` field (D68-A)", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(
      client,
      makeRequest({
        capability: {
          ...CAPABILITY,
          sampling: { ...CAPABILITY.sampling, minP: { min: 0, max: 1 } },
        },
        params: { minP: 0.05, effort: "high" },
      }),
      DEPS,
    );
    expect(captured.chatRequest?.["minP"]).toBe(0.05);
  });

  test("parallelToolCalls rides the wire ONLY alongside a tools[] request", async () => {
    const tools = [{ name: "get_weather", description: "weather", parameters: { type: "object" } }];
    const { client: withTools, captured: capA } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(withTools, makeRequest({ tools, params: { effort: "high", advanced: { parallelToolCalls: false } } }), DEPS);
    expect(capA.chatRequest?.["parallelToolCalls"]).toBe(false);

    // No tools[] → the flag is meaningless and omitted (byte-identical to a plain turn).
    const { client: noTools, captured: capB } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(noTools, makeRequest({ params: { effort: "high", advanced: { parallelToolCalls: false } } }), DEPS);
    expect(capB.chatRequest?.["parallelToolCalls"]).toBeUndefined();
  });

  test("verbosity: the chat-completions wire has NO field — a resolved verbosity drops LOUDLY (D68-B)", async () => {
    const onEvent = vi.fn();
    const { client, captured } = streamingClient(OK_STREAM);
    const result = await runChatCompletionTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, verbosity: ["low", "medium", "high"] },
        params: { verbosity: "high", effort: "high" },
        onEvent,
      }),
      DEPS,
    );
    // Never on the wire body.
    expect(captured.chatRequest?.["verbosity"]).toBeUndefined();
    // Dropped loudly — a `verbosity_dropped` warning event fired.
    const warnings = result.events.filter((e) => e.kind === "warning");
    expect(warnings).toContainEqual({
      kind: "warning",
      at: FIXED_NOW,
      code: "verbosity_dropped",
      message: "verbosity ignored: the chat-completions wire has no verbosity field",
    });
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ code: "verbosity_dropped" }));
  });

  test("emits the provider.sampling receipt (requested vs applied vs dropped, part 05 §3d)", async () => {
    const spy = vi.spyOn(logger, "debug");
    const { client } = streamingClient(OK_STREAM);
    // temperature applies; seed is dropped (CAPABILITY exposes no seed flag).
    await runChatCompletionTurn(client, makeRequest({ params: { temperature: 0.3, effort: "high", seed: 5 } }), DEPS);
    const line = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.sampling");
    expect(line).toBeDefined();
    const fields = line?.[0] as Record<string, unknown>;
    expect(fields["backend"]).toBe("openrouter");
    expect(fields["provider"]).toBe(true);
    expect(fields["requested"]).toEqual({ temperature: 0.3, seed: 5 });
    expect(fields["applied"]).toEqual({ temperature: 0.3 });
    expect(fields["dropped"]).toContainEqual({
      knob: "seed",
      reason: "model does not support seed",
    });
  });

  test("disables OpenRouter middle-out by default via the context-compression plugin", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, makeRequest(), DEPS);
    expect(captured.chatRequest?.["plugins"]).toEqual([{ id: "context-compression", enabled: false }]);
  });

  test("surfaces a resolve-chat dropped knob as a `warning` event (in events AND via onEvent)", async () => {
    const { client } = streamingClient(OK_STREAM);
    const onEvent = vi.fn();
    // CAPABILITY exposes no `seed` flag → resolve-chat drops it + warns.
    const result = await runChatCompletionTurn(client, makeRequest({ params: { effort: "high", seed: 5 }, onEvent }), DEPS);
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

  test("assembles delta.toolCalls fragments into ChatResult.toolCalls (the D48 tool loop, end-to-end)", async () => {
    // The model emits tool-call fragments across chunks (arguments sliced mid-token, id/name latch on
    // first sight) and finishes with `tool_calls` — the runner must feed these through the reducer so the
    // pipeline pivot sees the assembled calls. Two calls interleaved by wire `index`.
    const { client } = streamingClient([
      chunk({
        choices: [
          {
            delta: {
              toolCalls: [
                { index: 0, id: "call_a", type: "function", function: { name: "get_weather" } },
                { index: 1, id: "call_b", type: "function", function: { name: "get_time" } },
              ],
            },
            finishReason: null,
            index: 0,
          },
        ],
      }),
      chunk({
        choices: [
          {
            delta: {
              toolCalls: [
                { index: 0, function: { arguments: '{"city":' } },
                { index: 1, function: { arguments: '{"tz":"UTC"}' } },
              ],
            },
            finishReason: null,
            index: 0,
          },
        ],
      }),
      chunk({
        choices: [
          {
            delta: { toolCalls: [{ index: 0, function: { arguments: '"Paris"}' } }] },
            finishReason: "tool_calls",
            index: 0,
          },
        ],
      }),
    ]);
    const result = await runChatCompletionTurn(client, makeRequest(), DEPS);
    expect(result.finishReason).toBe("tool");
    expect(result.toolCalls).toEqual([
      { toolCallId: "call_a", name: "get_weather", arguments: '{"city":"Paris"}' },
      { toolCallId: "call_b", name: "get_time", arguments: '{"tz":"UTC"}' },
    ]);
  });

  test("a tool-less turn leaves ChatResult.toolCalls absent (byte-identical to pre-D48)", async () => {
    const { client } = streamingClient(OK_STREAM);
    const result = await runChatCompletionTurn(client, makeRequest(), DEPS);
    expect(result.toolCalls).toBeUndefined();
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
        send: (): Promise<unknown> => Promise.reject(Object.assign(new Error("bad key"), { statusCode: 401 })),
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

  function asMessages(items: { role: string; content: string }[]): Parameters<typeof placeHistoryCacheBreakpoint>[0] {
    return items as unknown as Parameters<typeof placeHistoryCacheBreakpoint>[0];
  }

  /** The same wire-shaped fixture with MULTIMODAL rows allowed: `content` is a part array, which the SDK's
   *  role-discriminated union carries and the placer reads structurally. */
  function asMixed(items: { role: string; content: unknown }[]): Parameters<typeof placeHistoryCacheBreakpoint>[0] {
    // FABRICATION-OK: a wire-shaped fixture for a vendor union we do not own (the `asWire` sibling likewise).
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
    expect(Array.isArray(placed.messages[0]?.content)).toBe(true);
  });

  test("emits the R1 PAIR — cache_control at `depth` AND `depth+2` on a long conversation", () => {
    // 6 long messages so both offset 1 (idx 4) and offset 3 (idx 2) clear the floor and are in range.
    const placed = placeHistoryCacheBreakpoint(
      asMessages([
        { role: "user", content: longText },
        { role: "assistant", content: longText },
        { role: "user", content: longText },
        { role: "assistant", content: longText },
        { role: "user", content: longText },
        { role: "assistant", content: longText },
      ]),
      "",
      1,
      CACHE_MIN,
    );
    // depth = offset 1 → idx 4; depth+2 = offset 3 → idx 2. Exactly two blocks placed, no third.
    const blocked = placed.messages.filter((m) => Array.isArray(m.content)).length;
    expect(blocked).toBe(2);
    expect(Array.isArray(placed.messages[4]?.content)).toBe(true);
    expect(Array.isArray(placed.messages[2]?.content)).toBe(true);
    // The REPORTED depths are the ones actually written — the pair, in placement order.
    expect(placed.placedDepths).toEqual([1, 3]);
  });

  test("leaves the array unchanged when the prefix is below the floor", () => {
    const placed = placeHistoryCacheBreakpoint(asMessages([{ role: "user", content: "tiny" }]), "", 0, CACHE_MIN);
    expect(placed.messages[0]?.content).toBe("tiny");
    expect(placed.placedDepths).toEqual([]);
  });

  test("leaves the array unchanged when the offset is out of range", () => {
    const messages = asMessages([{ role: "user", content: longText }]);
    expect(placeHistoryCacheBreakpoint(messages, "", 5, CACHE_MIN).messages).toBe(messages);
  });

  // THE LYING INSTRUMENT (the `provider.cache` receipt's source): a computed placement whose target row is
  // not a plain string is SKIPPED by the writer. Re-deriving the placements for the receipt therefore
  // reported breakpoints the body did not carry — over a cost regression, on the only signal that exists.
  // What is written is what is reported: the depth whose target is multimodal never appears.
  test("placedDepths reports only the depths actually WRITTEN (a non-string target is skipped, not reported)", () => {
    const messages = asMixed([
      { role: "user", content: longText },
      { role: "assistant", content: longText },
      { role: "user", content: [{ type: "text", text: longText }] },
      { role: "assistant", content: longText },
      { role: "user", content: longText },
    ]);
    // depth 1 → idx 3 (a string: written); depth 3 → idx 1... the multimodal row is idx 2, so pick the pair
    // that lands on it: depth 2 → idx 2 (multimodal: computed, skipped).
    const placed = placeHistoryCacheBreakpoint(messages, "", 2, CACHE_MIN);
    expect(placed.placedDepths).toEqual([4]);
    expect(Array.isArray(placed.messages[0]?.content)).toBe(true); // depth 4 → idx 0, written
    expect(placed.messages[2]?.content).toEqual([{ type: "text", text: longText }]); // untouched
  });

  // A row whose content is an ARRAY (a multimodal part list) cannot RECEIVE a breakpoint on this dialect —
  // but its bytes are on the wire and the `cacheMinTokens` floor is a measurement of the PREFIX. Counting
  // such a row as zero tokens read a genuinely long prefix as below the floor and dropped BOTH breakpoints,
  // i.e. caching silently off on exactly the expensive turns, with the error one-way (false negatives only).
  test("array-content prefix rows COUNT toward the cacheMinTokens floor (only PLACEMENT is string-only)", () => {
    const messages = asMixed([
      { role: "user", content: [{ type: "text", text: longText }] },
      { role: "assistant", content: "ok" },
      { role: "user", content: "and?" },
    ]);
    // depth 1 → the assistant row: a plain string, so it CAN carry the block; the floor must see the
    // multimodal user turn ahead of it.
    const placed = placeHistoryCacheBreakpoint(messages, "", 1, CACHE_MIN);
    expect(placed.messages[1]?.content).toEqual([{ type: "text", text: "ok", cacheControl: { type: "ephemeral", ttl: "1h" } }]);
  });
});

// ── The TOOL-EXCHANGE skew (findings §5) ────────────────────────────────────────────────────────────────
// The depth SHAPE hands the runner is CONVERSATIONAL: `assembly/shape.ts` computes it over canon rows, whose
// role axis is a two-arm `user|assistant` union — a `tool` row is unrepresentable there. Every tool row on
// the wire is therefore appended AFTER assembly by `chat/engine/pipeline.ts:runRecurseLoop`, which re-sends
// the SAME `cacheBreakpointFromEnd`. Two independent skews follow, pinned separately below; both are wrong
// the same way (the breakpoint slides FORWARD onto bytes generated this turn, which can never be read back).
describe("the history cache breakpoint is invariant across a within-turn tool exchange", () => {
  const longText = "word ".repeat(1500);
  // The conversational boundary every case below must land on: the last stable assistant turn.
  const BOUNDARY = `A2 ${longText}`;

  interface WireRow {
    readonly role: string;
    readonly content: string;
    readonly toolCalls?: readonly { readonly id: string }[];
    readonly toolCallId?: string;
  }

  function asWire(rows: readonly WireRow[]): Parameters<typeof placeHistoryCacheBreakpoint>[0] {
    // `ChatMessages` is the SDK's role-discriminated union with a branded `role` enum per arm; the placer reads
    // only role / toolCalls / content, and the point of these fixtures is the exact wire ROW ORDER a tool
    // exchange produces. A typed factory here would be a factory for a vendor union we do not own.
    // FABRICATION-OK: wire-shaped fixtures for a vendor union (the sibling `asMessages` helper does the same).
    return rows as unknown as Parameters<typeof placeHistoryCacheBreakpoint>[0];
  }

  // canon: u1 a1 u2 A2 u3 — exactly the 5-row shape SHAPE delivers, with the volatile user turn last. Its
  // safe offset is 1 (one step back from the tail), which is the boundary row `A2`.
  const CANON: readonly WireRow[] = [
    { role: "user", content: `U1 ${longText}` },
    { role: "assistant", content: `A1 ${longText}` },
    { role: "user", content: `U2 ${longText}` },
    { role: "assistant", content: BOUNDARY },
    { role: "user", content: `U3 ${longText}` },
  ];

  /** One recursion depth's appended exchange: the assistant row carrying its calls, then one `tool` row per
   *  call (`pipeline.ts:toolExchangeMessages`). `width` = the number of PARALLEL calls in that batch. */
  function exchange(width: number): WireRow[] {
    return [
      { role: "assistant", content: "calling", toolCalls: Array.from({ length: width }, (_, i) => ({ id: `call_${i}` })) },
      ...Array.from({ length: width }, (_, i): WireRow => ({ role: "tool", content: "ok", toolCallId: `call_${i}` })),
    ];
  }

  /** The CONTENT of every row that came back carrying a cache_control block — identity by bytes, not index,
   *  so a pin says which conversational row was cached rather than which array slot. */
  function cachedRows(placed: ReturnType<typeof placeHistoryCacheBreakpoint>): string[] {
    return placed.messages.flatMap((message) => {
      const content = message.content;
      if (!Array.isArray(content)) {
        return [];
      }
      return content.flatMap((block) => (typeof (block as { text?: unknown }).text === "string" ? [(block as { text: string }).text] : []));
    });
  }

  // PIN 1 — RECURSION DRIFT. The same offset, re-sent after one exchange, must still cache the same
  // conversational row. Pre-fix it slides onto the assistant tool-call row generated THIS turn (measured on
  // the live wire as a wasted cache write per depth — scripts/probes/openrouter/RESULTS.md, OR-5 arm 2).
  // The assertion is SET EQUALITY, not `toContain(BOUNDARY)`: the R1 pair's deeper leg (`depth+2`) happens
  // to land on the boundary even while the near leg has slid, so a containment check passes pre-fix and
  // proves nothing. What is actually claimed is that NEITHER leg moved.
  test("the SAME offset re-sent after a tool exchange caches the SAME conversational rows", () => {
    const before = cachedRows(placeHistoryCacheBreakpoint(asWire(CANON), "", 1, CACHE_MIN));
    const after = cachedRows(placeHistoryCacheBreakpoint(asWire([...CANON, ...exchange(1)]), "", 1, CACHE_MIN));
    expect(before).toContain(BOUNDARY);
    expect(after).toEqual(before);
  });

  // PIN 2 — PARALLEL FAN-OUT WIDTH. One depth of THREE parallel calls appends 4 array rows but only two
  // role groups. An array-offset placer therefore lands somewhere different for width 1 vs width 3; a
  // conversational placer lands on the same row for both.
  test("the placement does not move with the WIDTH of a parallel tool batch", () => {
    const narrow = cachedRows(placeHistoryCacheBreakpoint(asWire([...CANON, ...exchange(1)]), "", 1, CACHE_MIN));
    const wide = cachedRows(placeHistoryCacheBreakpoint(asWire([...CANON, ...exchange(3)]), "", 1, CACHE_MIN));
    expect(wide).toEqual(narrow);
  });

  // PIN 3 — a tool row NEVER carries the breakpoint. Accepted upstream (200) and therefore silent, which is
  // exactly why it needs a pin: it writes a cache entry keyed on bytes that cannot recur (OR-5 arm 4).
  test("no `tool` row and no tool-call assistant row is ever the breakpoint target", () => {
    const placed = placeHistoryCacheBreakpoint(asWire([...CANON, ...exchange(2)]), "", 1, CACHE_MIN);
    // Collected, then asserted once — a cached row is described by its role AND whether it carried tool
    // calls, and BOTH must be false for every block placed.
    const cachedRowShapes = placed.messages.flatMap((message) =>
      Array.isArray(message.content) ? [{ role: message.role, hadToolCalls: (message as { toolCalls?: unknown }).toolCalls !== undefined }] : [],
    );
    expect(cachedRowShapes).toEqual([
      { role: "assistant", hadToolCalls: false },
      { role: "assistant", hadToolCalls: false },
    ]);
  });

  // PIN 4 — the pair survives the exchange: `depth` AND `depth+2` both land on conversational rows.
  test("the R1 pair (`depth` + `depth+2`) stays on conversational rows across the exchange", () => {
    const placed = placeHistoryCacheBreakpoint(asWire([...CANON, ...exchange(2)]), "", 1, CACHE_MIN);
    // depth 1 → A2 (the boundary); depth 3 → A1, two conversational groups deeper. Array order, so A1 first.
    expect(cachedRows(placed)).toEqual([`A1 ${longText}`, BOUNDARY]);
  });
});

// The turns cell that turns the OR history-cache gate ON (an ANTHROPIC-family fact — ruling 3). The runner
// reads `explicitPromptCache` + `cacheMinTokens` off the capability, NOT `isAnthropicModel` + a hardcoded
// 1024 (W3). `historyCacheBreakpointFromEnd` is the ONE safe offset SHAPE computes.
const CACHE_TURNS = (cacheMinTokens: number): NonNullable<ModelCapability["turns"]> => ({
  assistantPrefill: false,
  midConversationSystem: false,
  roleHandlingFloor: "strict",
  explicitPromptCache: true,
  cacheMinTokens,
});

describe("the OR cache-placement gate reads the resolved turns flags (W3)", () => {
  const longText = "word ".repeat(1500); // ~1875 tokens per message

  function longHistory(rows: number): OpenRouterChatRequest["history"] {
    return Array.from({ length: rows }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: [{ type: "text" as const, text: longText }],
    }));
  }

  function cacheReq(cacheMinTokens: number, rows: number): OpenRouterChatRequest {
    return makeRequest({
      capability: { ...CAPABILITY, turns: CACHE_TURNS(cacheMinTokens) },
      history: longHistory(rows),
      historyCacheBreakpointFromEnd: 1,
    });
  }

  function blockCount(captured: Captured): number {
    const messages = captured.chatRequest?.["messages"];
    if (!Array.isArray(messages)) {
      return 0;
    }
    // messages[0] is the system message (always a cache block on Anthropic) — count history blocks only.
    return messages.slice(1).filter((m) => Array.isArray((m as { content: unknown }).content)).length;
  }

  test("Opus-4.8 floor (1024): a modest history clears the floor and gets the pair", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, cacheReq(1024, 6), DEPS);
    expect(blockCount(captured)).toBe(2); // the R1 pair (depth + depth+2)
  });

  test("Haiku-4.5 floor (4096): a two-message prefix stays BELOW the floor → no breakpoint (stops undercaching)", async () => {
    // Two ~1875-token messages ⇒ prefix ~3750 < 4096 at depth idx, so the pair is skipped: Haiku no longer
    // places a breakpoint that would burn a slot without forming a cache entry (the old hardcoded 1024 bug).
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, cacheReq(4096, 2), DEPS);
    expect(blockCount(captured)).toBe(0);
  });

  test("no turns cell (explicitPromptCache absent) ⇒ the gate does NOT place a history breakpoint", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, makeRequest({ history: longHistory(6), historyCacheBreakpointFromEnd: 1 }), DEPS);
    expect(blockCount(captured)).toBe(0);
  });

  test("emits the provider.cache receipt with the placed offsets + minCacheTokens (part 05 §3a)", async () => {
    const spy = vi.spyOn(logger, "info");
    const { client } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, cacheReq(1024, 6), DEPS);
    const cacheLine = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.cache");
    expect(cacheLine).toBeDefined();
    const fields = cacheLine?.[0] as Record<string, unknown>;
    expect(fields["backend"]).toBe("openrouter");
    expect(fields["provider"]).toBe(true);
    expect(fields["breakpointsPlaced"]).toBe(3); // 1 system + the R1 pair
    expect(fields["breakpointOffsets"]).toEqual([1, 3]);
    expect(fields["minCacheTokens"]).toBe(1024);
    // OK_STREAM reports cachedTokens: 8, no cacheWrite ⇒ hitRatio 1.
    expect(fields["cacheReadTokens"]).toBe(8);
    expect(fields["hitRatio"]).toBe(1);
  });

  // THE RECEIPT IS AN OBSERVATION, NOT A RE-DERIVATION. It is the only signal a cache regression produces,
  // so every number on it must be counted off the body that was sent. Two arms, both of which a recomputing
  // receipt got wrong: the system block is reported only when one was WRITTEN (an empty static prompt gets
  // no block, even on an Anthropic model — a bare `isAnthropicModel` check reported one anyway), and the
  // history depths are the depths the writer actually wrote.
  test("breakpointsPlaced counts the blocks ON THE WIRE — an empty static prompt reports NO system block", async () => {
    const spy = vi.spyOn(logger, "info");
    const { client } = streamingClient(OK_STREAM);
    const wires: Record<string, unknown>[] = [];
    await runChatCompletionTurn(
      client,
      makeRequest({
        capability: { ...CAPABILITY, turns: CACHE_TURNS(1024) },
        systemPrompt: { static: "", dynamic: "Be terse." },
        history: longHistory(6),
        historyCacheBreakpointFromEnd: 1,
      }),
      { ...DEPS, captureWire: (e): void => void wires.push(e.body) },
    );
    const messages = wires.at(0)?.["messages"] as { content: unknown }[];
    const blocksOnWire = messages
      .flatMap((m) => (Array.isArray(m.content) ? (m.content as Record<string, unknown>[]) : []))
      .filter((b) => b["cache_control"] !== undefined);
    const fields = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.cache")?.[0] as Record<string, unknown>;
    // The wire carries the R1 history pair and NO system block; the receipt says exactly that.
    expect(blocksOnWire).toHaveLength(2);
    expect(fields["breakpointsPlaced"]).toBe(2);
    expect(fields["breakpointOffsets"]).toEqual([1, 3]);
  });

  test("a non-cache turn (explicitPromptCache false) emits NO provider.cache line", async () => {
    const spy = vi.spyOn(logger, "info");
    const { client } = streamingClient(OK_STREAM);
    await runChatCompletionTurn(client, makeRequest({ model: castId<ModelId>(OPENAI_MODEL) }), DEPS);
    const cacheLine = spy.mock.calls.find((c) => (c[0] as { event?: string }).event === "provider.cache");
    expect(cacheLine).toBeUndefined();
  });
});

describe("a capability-kept system history row rides the wire as a REAL system message", () => {
  test("role system passes through to the messages array (never coerced to user)", async () => {
    const { client, captured } = streamingClient(OK_STREAM);
    const history: OpenRouterChatRequest["history"] = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "system", content: [{ type: "text", text: "GM note" }] },
    ];
    await runChatCompletionTurn(client, makeRequest({ history }), DEPS);
    const messages = captured.chatRequest?.["messages"] as Array<{ role: string; content: unknown }>;
    expect(messages.at(-1)).toEqual({ role: "system", content: "GM note" });
  });
});
