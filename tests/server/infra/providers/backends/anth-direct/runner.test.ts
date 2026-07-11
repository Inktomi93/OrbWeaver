// biome-ignore-all lint/style/useNamingConvention: snake_case wire fields (input_tokens, stop_reason,
// cache_read_input_tokens) are the real Anthropic Messages stream events, not orbweaver identifiers.
//
// backends/anth-direct runner — one turn over a FAKE AnthClient (no real key): the funnel→build→reduce→map
// pipeline, the result/usage mapping, the `provider.turn`/`provider.cache` emit (metadata only, never the
// secret), and the error path (an SDK throw → a typed ProviderError, an ok:false provider.turn).

import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import type { AnthropicMessagesChatRequest } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import type { AnthClient } from "@orb/server/infra/providers/backends/anth-direct";
import { runAnthDirectTurn } from "@orb/server/infra/providers/backends/anth-direct";
import { describe, vi } from "vitest";
import { anthEvent, anthStream } from "../../../../../support/factories/anth-wire.ts";
import {
  makeModelCapability,
  makeOpenRouterCredential,
} from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const MODEL = "anthropic/claude-opus-4-5";
const DEPS = { now: (): number => 5000 };
const OR_KEY = "sk-or-secret";

const CAPABILITY = makeModelCapability({
  turns: {
    assistantPrefill: false,
    midConversationSystem: true,
    roleHandlingFloor: "strict",
    explicitPromptCache: true,
    cacheMinTokens: 1024,
  },
});

function makeRequest(): AnthropicMessagesChatRequest {
  return {
    api: "anthropic-messages",
    credential: makeOpenRouterCredential({ apiKey: OR_KEY }),
    model: castId<ModelId>(MODEL),
    capability: CAPABILITY,
    params: {},
    systemPrompt: { static: "You are a bot.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
  };
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
        usage: {
          input_tokens: 50,
          output_tokens: 0,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 10,
        },
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

function streamingClient(events: RawMessageStreamEvent[]): AnthClient {
  return {
    messages: { create: () => Promise.resolve(anthStream(events)) },
  };
}

describe("runAnthDirectTurn — the turn pipeline", () => {
  test("maps reply/reasoning/finish/usage from the drained stream", async () => {
    const result = await runAnthDirectTurn(streamingClient(okEvents()), makeRequest(), DEPS);
    expect(result.reply).toBe("Hello!");
    expect(result.reasoning).toBe("");
    expect(result.finishReason).toBe("stop");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage.tokensIn).toBe(50);
    expect(result.usage.tokensOut).toBe(5);
    expect(result.usage.cacheReadTokens).toBe(30);
    expect(result.usage.cacheWriteTokens).toBe(10);
    // Stateless-backend semantics: no session/warm-spare/context-usage.
    expect(result.warmSpareClaimed).toBeNull();
    expect(result.contextUsage).toBeUndefined();
    expect(result.numTurns).toBe(1);
  });

  test("emits provider.turn (direct + openrouter source) + provider.cache — never the OR key", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    await runAnthDirectTurn(streamingClient(okEvents()), makeRequest(), DEPS);
    const events = infoSpy.mock.calls.map((call) => call[0] as Record<string, unknown>);
    const turn = events.find((e) => e["event"] === "provider.turn");
    const cache = events.find((e) => e["event"] === "provider.cache");
    expect(turn?.["transport"]).toBe("direct");
    expect(turn?.["credentialSource"]).toBe("openrouter");
    expect(cache?.["minCacheTokens"]).toBe(1024);
    expect(JSON.stringify(events)).not.toContain(OR_KEY);
    infoSpy.mockRestore();
  });

  test("an SDK create() throw → a typed ProviderError + an ok:false provider.turn", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const failing: AnthClient = {
      messages: {
        create: () => Promise.reject(Object.assign(new Error("unauthorized"), { status: 401 })),
      },
    };
    await expect(runAnthDirectTurn(failing, makeRequest(), DEPS)).rejects.toThrow(ProviderError);
    const failTurn = infoSpy.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((e) => e["event"] === "provider.turn" && e["ok"] === false);
    expect(failTurn).toBeDefined();
    expect(failTurn?.["transport"]).toBe("direct");
    infoSpy.mockRestore();
  });
});
