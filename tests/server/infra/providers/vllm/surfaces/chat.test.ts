// Unit tests for the vLLM streaming CHAT surface — drains a fake SSE byte stream through the SHARED kit
// reducer. Asserts: text reply accumulation, `reasoning_content` → the CoT channel, live onDelta dispatch,
// finish-reason + usage mapping, deterministic turn timing (injected `now`), and that a prompt-only
// (agent-sdk) request is fail-closed. Independent — it only calls `client.engineStream`.

import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatRequest } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { createVllmChat } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { makeModelCapability, makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const CRED = makeResolvedCredential("vllm");
const MODEL = "Qwen/Qwen3-VL-8B-Instruct" as ModelId;
const CAP = makeModelCapability({
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 32_768 },
});

// Build a ReadableStream of SSE bytes from raw chunk payloads + the [DONE] sentinel.
function sseStream(payloads: string[]): ReadableStream<Uint8Array> {
  const text = `${payloads.map((p) => `data: ${p}`).join("\n")}\ndata: [DONE]\n`;
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function streamingClient(payloads: string[]): VllmEngineClient {
  return {
    enginePost: () => Promise.reject(new Error("chat must stream, not POST-json")),
    engineStream: () => Promise.resolve(sseStream(payloads)),
    baseUrl: () => "http://127.0.0.1:0",
  };
}

// A 2-call clock: turn start = 1000, settle = 1500 → durationApiMs = 500 (deterministic).
function clock(): () => number {
  const stamps = [1000, 1500];
  let i = 0;
  return () => stamps[Math.min(i++, stamps.length - 1)] ?? 1500;
}

function chatReq(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    api: "chat-completions",
    credential: CRED,
    model: MODEL,
    capability: CAP,
    params: {},
    systemPrompt: { static: "you are terse", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    ...overrides,
  } as ChatRequest;
}

describe("createVllmChat", () => {
  test("accumulates the streamed reply + reasoning and maps finish/usage", async () => {
    const client = streamingClient([
      '{"choices":[{"delta":{"content":"Hel"}}]}',
      '{"choices":[{"delta":{"content":"lo"}}]}',
      '{"choices":[{"delta":{"reasoning_content":"thinking"}}]}',
      '{"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
    ]);
    const deltas: { kind: string; text: string }[] = [];
    const chat = createVllmChat({ client, now: clock() });
    const res = await chat(chatReq({ onDelta: (d) => deltas.push({ kind: d.kind, text: d.text }) }));

    expect(res.reply).toBe("Hello");
    expect(res.reasoning).toBe("thinking");
    expect(res.finishReason).toBe("stop");
    expect(res.usage.tokensIn).toBe(3);
    expect(res.usage.tokensOut).toBe(2);
    expect(res.usage.model).toBe(MODEL);
    expect(res.usage.contextWindow).toBe(32_768);
    expect(res.durationApiMs).toBe(500);
    // Live deltas dispatched as they streamed (text + reasoning channels).
    expect(deltas).toContainEqual({ kind: "text", text: "Hel" });
    expect(deltas).toContainEqual({ kind: "reasoning", text: "thinking" });
  });

  test("emits min_p in the wire body when the user set minP (D68-A)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { minP: 0.03 } }));
    expect(sentBody?.["min_p"]).toBe(0.03);
  });

  test("no min_p field when the user did not set minP (byte-stable)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(sentBody).not.toHaveProperty("min_p");
  });

  // STRICTFMT: guided decoding is an ENFORCING wire — `strict:true` is the xgrammar populate lever (an 8B
  // skips optionals unless the grammar REQUIRES them). The shared kit builder no longer invents a default, so
  // this surface PINS it; losing the pin silently downgrades every structured vLLM call to unenforced JSON.
  test("pins strict:true on response_format when the caller is silent (guided decoding is the enforcing wire)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ responseFormat: { name: "extract", schema: { type: "object" } } }));
    expect(sentBody?.["response_format"]).toEqual({
      type: "json_schema",
      // biome-ignore lint/style/useNamingConvention: the OpenAI-compatible `response_format` wire field name.
      json_schema: { name: "extract", schema: { type: "object" }, strict: true },
    });
  });

  test("an EXPLICIT strict:false from the caller still wins over the vLLM pin", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ responseFormat: { name: "extract", schema: {}, strict: false } }));
    expect(sentBody?.["response_format"]).toEqual({
      type: "json_schema",
      // biome-ignore lint/style/useNamingConvention: the OpenAI-compatible `response_format` wire field name.
      json_schema: { name: "extract", schema: {}, strict: false },
    });
  });

  test("wires max_tokens = DEFAULT_MAX_OUTPUT_TOKENS when unset (the response-length default, NOT the window)", async () => {
    // The amnesia coupling: the runner's fallback must be a sane response length, never the window — and it
    // must equal the budget's reserve fallback (both `DEFAULT_MAX_OUTPUT_TOKENS`). A concrete-materialized
    // intent (the chat path) sets it explicitly; this pins the non-chat fallback.
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(sentBody?.["max_tokens"]).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  test("wires the explicit maxOutputTokens as max_tokens (the reserve == runner max_tokens coupling)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: { maxOutputTokens: 512 } }));
    expect(sentBody?.["max_tokens"]).toBe(512);
  });

  // ── item 7: the per-request presence-penalty default (engineLaunch.genPresencePenalty). Verified by the
  // WIRE BODY only — never a live vLLM request (engines are up; launcher/request-firing is banned). ──
  test("applies the card-default presence_penalty (1.5) when the preset is silent and no getter is injected", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock() });
    await chat(chatReq({ params: {} }));
    expect(sentBody?.["presence_penalty"]).toBe(1.5);
  });

  test("applies the INJECTED genPresencePenalty default when the preset is silent (admin retune, per request)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock(), genPresencePenalty: () => 0.3 });
    await chat(chatReq({ params: {} }));
    expect(sentBody?.["presence_penalty"]).toBe(0.3);
  });

  test("a preset's explicit presencePenalty WINS over the admin default", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const client: VllmEngineClient = {
      enginePost: () => Promise.reject(new Error("chat must stream")),
      engineStream: (_lane, _path, body) => {
        sentBody = body as Record<string, unknown>;
        return Promise.resolve(sseStream(['{"choices":[{"finish_reason":"stop"}]}']));
      },
      baseUrl: () => "http://127.0.0.1:0",
    };
    const chat = createVllmChat({ client, now: clock(), genPresencePenalty: () => 0.3 });
    await chat(chatReq({ params: { presencePenalty: 1.9 } }));
    expect(sentBody?.["presence_penalty"]).toBe(1.9);
  });

  test("forwards the chatId on each delta", async () => {
    const client = streamingClient(['{"choices":[{"delta":{"content":"x"}}]}']);
    const seen: ChatId[] = [];
    const chat = createVllmChat({ client, now: clock() });
    await chat(
      chatReq({
        chatId: castId<ChatId>("chat_123"),
        onDelta: (d) => seen.push(d.chatId),
      }),
    );

    expect(seen[0]).toBe(castId<ChatId>("chat_123"));
  });

  test("fail-closes a prompt-only (agent-sdk) request — vLLM speaks only the history wire", async () => {
    const client = streamingClient([]);
    const chat = createVllmChat({ client, now: clock() });
    await expect(
      chat({
        api: "agent-sdk",
        credential: CRED,
        model: MODEL,
        capability: CAP,
        params: {},
        systemPrompt: { static: "s", dynamic: "" },
        prompt: "hello",
      } as ChatRequest),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
