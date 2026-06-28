// Unit tests for the vLLM streaming CHAT surface — drains a fake SSE byte stream through the SHARED kit
// reducer. Asserts: text reply accumulation, `reasoning_content` → the CoT channel, live onDelta dispatch,
// finish-reason + usage mapping, deterministic turn timing (injected `now`), and that a prompt-only
// (agent-sdk) request is fail-closed. Independent — it only calls `client.engineStream`.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatRequest } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { createVllmChat } from "@orb/server/infra/providers/vllm";
import type { VllmEngineClient } from "@orb/server/infra/providers/vllm/engine";
import { describe, expect, test } from "vitest";

const CRED = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;
const MODEL = "Qwen/Qwen3-VL-8B-Instruct" as ModelId;
const CAP = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 32_768 },
} as unknown as ModelCapability;

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
    const res = await chat(
      chatReq({ onDelta: (d) => deltas.push({ kind: d.kind, text: d.text }) }),
    );

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

  test("forwards the chatId on each delta", async () => {
    const client = streamingClient(['{"choices":[{"delta":{"content":"x"}}]}']);
    const seen: ChatId[] = [];
    const chat = createVllmChat({ client, now: clock() });
    await chat(
      chatReq({
        chatId: "chat_123",
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
