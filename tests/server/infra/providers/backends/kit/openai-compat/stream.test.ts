// backends/kit/openai-compat/stream — the pure reducer (content + reasoning accumulation, channel
// preference, in-band error promotion, sentinel usage), the deterministic view→ChatResult mapper (injected
// clock), and the tolerant raw-SSE parser.

import type {
  ChatCompletionResult,
  ChatCompletionStreamChunk,
  StreamDelta,
} from "@orb/server/infra/providers/backends/kit";
import {
  mapChatCompletionToTurnResult,
  parseOpenAiSse,
  reduceChatCompletionStream,
} from "@orb/server/infra/providers/backends/kit/openai-compat";
import { describe, expect, test } from "vitest";

async function* streamOf(
  items: readonly ChatCompletionStreamChunk[],
): AsyncGenerator<ChatCompletionStreamChunk> {
  await Promise.resolve(); // yields control once so this is a genuine async stream
  for (const item of items) {
    yield item;
  }
}

function sseBody(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("reduceChatCompletionStream", () => {
  test("accumulates content, emits deltas + per-chunk pulses, reads the sentinel usage/finish", async () => {
    const deltas: StreamDelta[] = [];
    let chunkPulses = 0;
    const view = await reduceChatCompletionStream(
      streamOf([
        { choices: [{ delta: { content: "Hello" } }] },
        { choices: [{ delta: { content: ", world" } }] },
        { choices: [{ delta: { reasoning: "pondering" } }] },
        { choices: [{ finishReason: "stop" }], usage: { promptTokens: 3, completionTokens: 2 } },
      ]),
      {
        onDelta: (delta): void => {
          deltas.push(delta);
        },
        onChunk: (): void => {
          chunkPulses += 1;
        },
      },
    );
    expect(view.choices?.[0]?.message?.content).toBe("Hello, world");
    expect(view.choices?.[0]?.finishReason).toBe("stop");
    expect(view.usage?.promptTokens).toBe(3);
    expect(deltas).toEqual([
      { kind: "text", text: "Hello" },
      { kind: "text", text: ", world" },
      { kind: "reasoning", text: "pondering" },
    ]);
    expect(chunkPulses).toBe(4);
  });

  test("prefers the structured reasoning channel and skips encrypted entries", async () => {
    const deltas: StreamDelta[] = [];
    await reduceChatCompletionStream(
      streamOf([
        {
          choices: [
            {
              delta: {
                reasoning: "LEGACY-SHOULD-NOT-APPEAR",
                reasoningDetails: [
                  { type: "reasoning.text", text: "structured" },
                  { type: "reasoning.encrypted", text: "OPAQUE" },
                ],
              },
            },
          ],
        },
      ]),
      {
        onDelta: (delta): void => {
          deltas.push(delta);
        },
      },
    );
    expect(deltas).toEqual([{ kind: "reasoning", text: "structured" }]);
  });

  test("falls back to the legacy reasoning string when details carry no text", async () => {
    const deltas: StreamDelta[] = [];
    await reduceChatCompletionStream(
      streamOf([{ choices: [{ delta: { reasoning: "legacy CoT", reasoningDetails: [] } }] }]),
      {
        onDelta: (delta): void => {
          deltas.push(delta);
        },
      },
    );
    expect(deltas).toEqual([{ kind: "reasoning", text: "legacy CoT" }]);
  });

  test("promotes an in-band stream error to a throw carrying the status code", async () => {
    await expect(
      reduceChatCompletionStream(
        streamOf([{ choices: [], error: { code: 429, message: "rate limited" } }]),
      ),
    ).rejects.toMatchObject({ message: "rate limited", statusCode: 429 });
  });
});

describe("mapChatCompletionToTurnResult", () => {
  const view: ChatCompletionResult = {
    choices: [{ message: { content: "  the reply  " }, finishReason: "length" }],
    usage: {
      promptTokens: 100,
      completionTokens: 50,
      cost: 0.01,
      promptTokensDetails: { cachedTokens: 20, cacheWriteTokens: 80 },
      completionTokensDetails: { reasoningTokens: 10 },
      costDetails: {
        upstreamInferenceCost: 0.02,
        upstreamInferencePromptCost: 0.015,
        upstreamInferenceCompletionsCost: 0.005,
      },
      isByok: true,
    },
  };

  test("maps usage, derives durationApiMs from the injected clock, normalizes finish", () => {
    const result = mapChatCompletionToTurnResult(view, {
      model: "claude-opus-4-8",
      startedAt: 1000,
      now: 1500,
      contextWindow: 200_000,
      maxOutputTokens: 4096,
    });
    expect(result.reply).toBe("the reply");
    expect(result.durationApiMs).toBe(500);
    expect(result.finishReason).toBe("length");
    expect(result.stopReason).toBe("length");
    expect(result.numTurns).toBe(1);
    expect(result.usage.tokensIn).toBe(100);
    expect(result.usage.tokensOut).toBe(50);
    expect(result.usage.cacheReadTokens).toBe(20);
    expect(result.usage.cacheWriteTokens).toBe(80);
    expect(result.usage.reasoningTokens).toBe(10);
    expect(result.usage.contextWindow).toBe(200_000);
    expect(result.usage.costUsd).toBe(0.01);
    expect(result.usage.costDetails).toEqual({
      totalUsd: 0.02,
      promptUsd: 0.015,
      completionUsd: 0.005,
    });
    expect(result.usage.isByok).toBe(true);
    // The 5m/1h split is SDK-internal — the chat-completions path can't report it.
    expect(result.usage.cacheCreation5mTokens).toBeNull();
  });

  test("has NO sessionId (OpenAI-compatible runners have no SDK session)", () => {
    const result = mapChatCompletionToTurnResult(view, {
      model: "m",
      startedAt: 0,
      now: 1,
      contextWindow: null,
      maxOutputTokens: null,
    });
    expect("sessionId" in result).toBe(false);
  });

  test("uses ctx.reasoning when provided, else the view's message.reasoning", () => {
    const streamed = mapChatCompletionToTurnResult(view, {
      model: "m",
      startedAt: 0,
      now: 1,
      contextWindow: null,
      maxOutputTokens: null,
      reasoning: "streamed CoT",
    });
    expect(streamed.reasoning).toBe("streamed CoT");

    const oneShot = mapChatCompletionToTurnResult(
      { choices: [{ message: { content: "x", reasoning: "one-shot CoT" } }] },
      { model: "m", startedAt: 0, now: 1, contextWindow: null, maxOutputTokens: null },
    );
    expect(oneShot.reasoning).toBe("one-shot CoT");
  });
});

describe("the raw SSE parser", () => {
  test("yields JSON payloads, skips comments/events/blanks/bad-json, stops at [DONE]", async () => {
    const text = `${[
      ": a keepalive comment",
      'data: {"n":1}',
      "",
      "event: ping",
      "data: not-json-here",
      'data: {"n":2}',
      "data: [DONE]",
      'data: {"n":3}',
    ].join("\n")}\n`;
    const out: unknown[] = [];
    for await (const item of parseOpenAiSse(sseBody(text))) {
      out.push(item);
    }
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
  });
});
