// biome-ignore-all lint/style/useNamingConvention: snake_case wire fields (input_tokens, stop_reason,
// cache_read_input_tokens) are the real Anthropic Messages stream events, not orbweaver identifiers.
//
// backends/anth-direct index — the sealed backend FACTORY contract: it registers under the anth-direct key,
// serves runChatTurn ONLY (chat-only charter), fail-closes on a wrong api / the sub-exclusion source BEFORE
// constructing a client, and otherwise dispatches to the runner. (The runner pipeline + the credential guard
// have their own mirror tests — runner.test.ts / credential-guard.test.ts.)

import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AnthropicMessagesChatRequest, ChatRequest } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { AnthClient } from "@orb/server/infra/providers/backends/anth-direct";
import { createAnthDirectBackend } from "@orb/server/infra/providers/backends/anth-direct";
import { describe, vi } from "vitest";
import { anthEvent, anthStream } from "../../../../../support/factories/anth-wire.ts";
import { makeModelCapability, makeOpenRouterCredential, makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const MODEL = "anthropic/claude-opus-4-5";
const DEPS = { now: (): number => 5000 };

const CAPABILITY = makeModelCapability({
  turns: {
    assistantPrefill: false,
    midConversationSystem: true,
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: 1024,
  },
});

function makeRequest(overrides: Partial<AnthropicMessagesChatRequest> = {}): AnthropicMessagesChatRequest {
  const base: AnthropicMessagesChatRequest = {
    api: "anthropic-messages",
    credential: makeOpenRouterCredential({ apiKey: "sk-or-secret" }),
    model: castId<ModelId>(MODEL),
    capability: CAPABILITY,
    params: {},
    systemPrompt: { static: "You are a bot.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
  };
  return { ...base, ...overrides };
}

function okEvents(): RawMessageStreamEvent[] {
  return [
    anthEvent({
      type: "message_start",
      message: {
        id: "m1",
        type: "message",
        role: "assistant",
        content: [],
        model: MODEL,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 50, output_tokens: 0 },
      },
    }),
    anthEvent({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    anthEvent({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "Hello!" },
    }),
    anthEvent({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 5 },
    }),
    anthEvent({ type: "message_stop" }),
  ];
}

function fakeClient(events: RawMessageStreamEvent[]): {
  client: AnthClient;
  captured: { params: unknown };
} {
  const captured: { params: unknown } = { params: undefined };
  const client: AnthClient = {
    messages: {
      create: (params) => {
        captured.params = params;
        return Promise.resolve(anthStream(events));
      },
    },
  };
  return { client, captured };
}

function runTurn(backend: ReturnType<typeof createAnthDirectBackend>, req: ChatRequest): Promise<unknown> {
  const run = backend.runChatTurn;
  if (run === undefined) {
    throw new Error("anth-direct backend must wire runChatTurn");
  }
  return run(req);
}

describe("createAnthDirectBackend — the sealed factory", () => {
  test("registers under the anth-direct key and serves runChatTurn only (chat-only charter)", () => {
    const backend = createAnthDirectBackend({ ...DEPS, getClient: () => fakeClient([]).client });
    expect(backend.key).toBe("anth-direct");
    expect(typeof backend.runChatTurn).toBe("function");
    expect(backend.embed).toBeUndefined();
    expect(backend.runAgentTurn).toBeUndefined();
    expect(backend.rerank).toBeUndefined();
  });

  test("dispatches a valid anthropic-messages turn through to the runner (fake client, no real key)", async () => {
    const { client, captured } = fakeClient(okEvents());
    const backend = createAnthDirectBackend({ ...DEPS, getClient: () => client });
    const result = await runTurn(backend, makeRequest());
    expect(result).toMatchObject({ reply: "Hello!", finishReason: "stop" });
    expect(captured.params).toMatchObject({ stream: true, model: MODEL });
  });

  test("a non-anthropic-messages api is fail-closed INVALID (never reaches a client)", async () => {
    const getClient = vi.fn(() => fakeClient([]).client);
    const backend = createAnthDirectBackend({ ...DEPS, getClient });
    // A deliberate wrong-api probe — the arm is anthropic-messages by construction, so this forces the
    // FABRICATION-OK: non-matching discriminant the runtime guard rejects (an invalid-input probe, W1h escape).
    const wrongApi = { ...makeRequest(), api: "chat-completions" } as unknown as ChatRequest;
    await expect(runTurn(backend, wrongApi)).rejects.toThrow(ProviderError);
    expect(getClient).not.toHaveBeenCalled();
  });

  test("THE SUB-EXCLUSION: a max-pro-sub credential fails BEFORE any client is constructed", async () => {
    const getClient = vi.fn(() => fakeClient([]).client);
    const backend = createAnthDirectBackend({ ...DEPS, getClient });
    await expect(runTurn(backend, makeRequest({ credential: makeResolvedCredential("max-pro-sub") }))).rejects.toThrow(ProviderError);
    expect(getClient).not.toHaveBeenCalled();
  });
});
