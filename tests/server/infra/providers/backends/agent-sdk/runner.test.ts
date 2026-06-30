// biome-ignore-all lint/style/useNamingConvention: synthetic SDK message fixtures use the SDK's
// snake_case wire fields (session_id, stop_reason, num_turns, modelUsage, cache_creation, …).
//
// The stream→ChatResult reducer (consumeTurnStream) + the backend factory (createAgentSdkBackend),
// driven by hand-built message streams + an injected fake `query` — no live spawn. Asserts: a success
// stream reduces to a ChatResult (reply/usage/finishReason) and reports the session id once; an error
// result throws a typed ProviderError; the init shape guard fires; and a second turn RESUMES the cached
// session (the Max-sub prompt-cache survival) while a non-agent-sdk request fail-closes.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatRequest, ChatResult } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import {
  consumeTurnStream,
  createAgentSdkBackend,
} from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, expect, test, vi } from "vitest";

const MODEL = "claude-x";
const SESSION_ID = "sess-1";
const FIXED_NOW = 1000;
const MISSING_SESSION_ID_RE = /missing session_id/u;

/** The reducer's stream param type, named without importing the SDK (its private to the backend). */
type MessageStream = Parameters<typeof consumeTurnStream>[0];

/** A vLLM (keyless, loopback) credential cast in at the fake edge — avoids touching host `.claude`. */
const VLLM_CRED = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;

const CAPABILITY: ModelCapability = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
};

function streamOf(messages: readonly unknown[]): MessageStream {
  async function* gen(): AsyncGenerator<never> {
    await Promise.resolve();
    for (const message of messages) {
      yield message as never;
    }
  }
  return gen() as MessageStream;
}

const initMsg = { type: "system", subtype: "init", session_id: SESSION_ID, apiKeySource: "oauth" };
const assistantMsg = {
  type: "assistant",
  session_id: SESSION_ID,
  message: { content: [{ type: "text", text: "Hello" }], stop_reason: "end_turn" },
};
const successResult = {
  type: "result",
  subtype: "success",
  session_id: SESSION_ID,
  num_turns: 1,
  stop_reason: "end_turn",
  duration_api_ms: 100,
  ttft_ms: 20,
  is_error: false,
  modelUsage: {
    [MODEL]: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
      costUSD: 0.001,
      contextWindow: 200_000,
      maxOutputTokens: 4096,
    },
  },
  usage: { cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } },
};

const baseCtx = { model: MODEL, resumed: false, now: (): number => FIXED_NOW };

/** The wired chat-turn fn (the backend always sets it; the cast drops the contract's `| undefined`). */
type ChatTurn = (req: ChatRequest) => Promise<ChatResult>;

describe("consumeTurnStream", () => {
  test("reduces a success stream to a ChatResult and reports the session id once", async () => {
    const onSessionId = vi.fn();
    const result = await consumeTurnStream(streamOf([initMsg, assistantMsg, successResult]), {
      ...baseCtx,
      onSessionId,
    });
    expect(result.reply).toBe("Hello");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.tokensIn).toBe(10);
    expect(result.usage.tokensOut).toBe(5);
    expect(result.usage.costUsd).toBeCloseTo(0.001);
    expect(result.numTurns).toBe(1);
    expect(onSessionId).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
  });

  test("an error result throws a typed ProviderError", async () => {
    const errorResult = {
      type: "result",
      subtype: "error_during_execution",
      session_id: SESSION_ID,
      num_turns: 1,
      stop_reason: null,
      errors: ["boom"],
      modelUsage: {},
      usage: {},
    };
    await expect(
      consumeTurnStream(streamOf([initMsg, errorResult]), baseCtx),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  test("the init shape guard fires when session_id is missing", async () => {
    const badInit = { type: "system", subtype: "init", apiKeySource: "oauth" };
    await expect(consumeTurnStream(streamOf([badInit]), baseCtx)).rejects.toThrow(
      MISSING_SESSION_ID_RE,
    );
  });
});

describe("createAgentSdkBackend", () => {
  function buildReq(chatId: string): ChatRequest {
    return {
      api: "agent-sdk",
      prompt: "hi",
      credential: VLLM_CRED,
      model: castId<ModelId>(MODEL),
      capability: CAPABILITY,
      params: {},
      systemPrompt: { static: "", dynamic: "" },
      chatId,
    };
  }

  test("runChatTurn reduces a turn; a second turn RESUMES the cached session", async () => {
    const fakeQuery = vi.fn((_args: { options?: { resume?: string } }) =>
      streamOf([initMsg, assistantMsg, successResult]),
    );
    const backend = createAgentSdkBackend({ now: () => 0, query: fakeQuery as never });
    expect(backend.runChatTurn).toBeDefined();
    const run = backend.runChatTurn as ChatTurn;

    const first = await run(buildReq("chat-1"));
    expect(first.reply).toBe("Hello");
    // Turn 1 started fresh (no resume); turn 2 resumes the session id the SDK reported.
    expect(fakeQuery.mock.calls[0]?.[0]?.options?.resume).toBeUndefined();

    await run(buildReq("chat-1"));
    expect(fakeQuery.mock.calls[1]?.[0]?.options?.resume).toBe(SESSION_ID);
  });

  test("a non-agent-sdk request fail-closes with a typed ProviderError", async () => {
    const backend = createAgentSdkBackend({ now: () => 0, query: vi.fn() as never });
    expect(backend.runChatTurn).toBeDefined();
    const run = backend.runChatTurn as ChatTurn;
    const wrongApi = { api: "chat-completions" } as unknown as ChatRequest;
    await expect(run(wrongApi)).rejects.toBeInstanceOf(ProviderError);
  });

  test("surfaces a resolve-chat dropped knob as a `warning` event (in events AND via onEvent)", async () => {
    const fakeQuery = vi.fn(() => streamOf([initMsg, assistantMsg, successResult]));
    const backend = createAgentSdkBackend({ now: () => FIXED_NOW, query: fakeQuery as never });
    const run = backend.runChatTurn as ChatTurn;
    const onEvent = vi.fn();
    // CAPABILITY (reasoning none, sampling {}) exposes no temperature range → resolve-chat drops it + warns.
    const result = await run({ ...buildReq("chat-warn"), params: { temperature: 0.7 }, onEvent });
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
