// backends/kit/openai-compat/stream — the pure reducer (content + reasoning accumulation, channel
// preference, in-band error promotion, sentinel usage), the deterministic view→ChatResult mapper (injected
// clock), and the tolerant raw-SSE parser.

import { ProviderError } from "@orb/server/infra/providers";
import type { ChatCompletionResult, ChatCompletionStreamChunk, ChatToolCallDelta, StreamDelta } from "@orb/server/infra/providers/backends/kit";
import { mapChatCompletionToTurnResult, parseOpenAiSse, reduceChatCompletionStream } from "@orb/server/infra/providers/backends/kit/openai-compat";
import { describe } from "vitest";
import { expect, test } from "../../../../../../support/fixtures.ts";

const SSE_LIMIT_ERROR = /SSE.*limit/i;
const TRUNCATED_ERROR = /no finish reason/i;

/** The terminal chunk EVERY completed chat-completions generation ends with. The accumulation fixtures below
 *  append it because the reducer now REFUSES a stream that never terminated (#1400) — they are about what the
 *  reducer accumulates, not about how a stream ends, and a fixture that stops mid-stream would be asserting
 *  the truncated shape by accident. */
const TERMINAL_CHUNK: ChatCompletionStreamChunk = { choices: [{ delta: {}, finishReason: "stop" }] };

async function* streamOf(items: readonly ChatCompletionStreamChunk[]): AsyncGenerator<ChatCompletionStreamChunk> {
  await Promise.resolve(); // yields control once so this is a genuine async stream
  for (const item of items) {
    yield item;
  }
}

function chunkWithToolCalls(toolCalls: readonly ChatToolCallDelta[]): ChatCompletionStreamChunk {
  return { choices: [{ delta: { toolCalls }, finishReason: null }] };
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
        TERMINAL_CHUNK,
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
    await reduceChatCompletionStream(streamOf([{ choices: [{ delta: { reasoning: "legacy CoT", reasoningDetails: [] } }] }, TERMINAL_CHUNK]), {
      onDelta: (delta): void => {
        deltas.push(delta);
      },
    });
    expect(deltas).toEqual([{ kind: "reasoning", text: "legacy CoT" }]);
  });

  test("latches the generation handle (`gen-…`) from the first chunk that carries one (PD-137)", async () => {
    const view = await reduceChatCompletionStream(
      streamOf([
        { id: "gen-abc123", choices: [{ delta: { content: "hi" } }] },
        // A later chunk repeats the same id; the reducer keeps the first-latched value.
        { id: "gen-abc123", choices: [{ finishReason: "stop" }] },
      ]),
    );
    expect(view.id).toBe("gen-abc123");
  });

  test("carries no id when the stream never reports one (a spec-sloppy BYO endpoint)", async () => {
    const view = await reduceChatCompletionStream(streamOf([{ choices: [{ delta: { content: "hi" }, finishReason: "stop" }] }]));
    expect("id" in view).toBe(false);
  });

  test("promotes an in-band stream error to a throw carrying the status code", async () => {
    await expect(reduceChatCompletionStream(streamOf([{ choices: [], error: { code: 429, message: "rate limited" } }]))).rejects.toMatchObject({
      message: "rate limited",
      statusCode: 429,
    });
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

  test("preserves usage recordedness instead of fabricating zeroes", () => {
    const ctx = { model: "m", startedAt: 0, now: 1, contextWindow: null, maxOutputTokens: null } as const;
    const bare = mapChatCompletionToTurnResult({ choices: [{ message: { content: "ok" } }] }, ctx);
    expect(bare.usage).toMatchObject({ tokensIn: null, tokensOut: null, costUsd: null });

    const partial = mapChatCompletionToTurnResult({ choices: [{ message: { content: "ok" } }], usage: { promptTokens: 3 } }, ctx);
    expect(partial.usage).toMatchObject({ tokensIn: 3, tokensOut: null, costUsd: null });

    const reportedZero = mapChatCompletionToTurnResult(
      { choices: [{ message: { content: "ok" } }], usage: { promptTokens: 0, completionTokens: 0, cost: 0 } },
      ctx,
    );
    expect(reportedZero.usage).toMatchObject({ tokensIn: 0, tokensOut: 0, costUsd: 0 });
  });

  test("surfaces the view's generation handle as ChatResult.generationId, else omits it (PD-137)", () => {
    const withId = mapChatCompletionToTurnResult({ ...view, id: "gen-xyz" }, { model: "m", startedAt: 0, now: 1, contextWindow: null, maxOutputTokens: null });
    expect(withId.generationId).toBe("gen-xyz");

    const withoutId = mapChatCompletionToTurnResult(view, {
      model: "m",
      startedAt: 0,
      now: 1,
      contextWindow: null,
      maxOutputTokens: null,
    });
    expect("generationId" in withoutId).toBe(false);
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
  test("rejects an unterminated SSE line beyond the hard buffer cap", async () => {
    const oversized = `data: {"value":"${"x".repeat(1_048_576)}"}`;
    await expect(async () => {
      for await (const _item of parseOpenAiSse(sseBody(oversized))) {
        // no-op: the parser must reject before yielding
      }
    }).rejects.toThrow(SSE_LIMIT_ERROR);
  });

  test("yields JSON payloads, skips comments/events/blanks, stops at [DONE]", async () => {
    const text = `${[": a keepalive comment", 'data: {"n":1}', "", "event: ping", 'data: {"n":2}', "data: [DONE]", 'data: {"n":3}'].join("\n")}\n`;
    const out: unknown[] = [];
    for await (const item of parseOpenAiSse(sseBody(text))) {
      out.push(item);
    }
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
  });

  // #758: a malformed `data:` payload can carry content/error/terminal semantics — silently dropping it
  // (the superseded contract, moved out of the test above) let the reducer return a partial/empty
  // ChatResult as a SUCCESS. Only a RESULT-BEARING `data:` line that fails JSON.parse is a protocol
  // error; blank lines, SSE comments, and non-data fields (proven above) stay skippable.
  test("throws a contextual error instead of silently dropping a malformed `data:` JSON payload (#758)", async () => {
    const text = `${['data: {"n":1}', "data: not-json-here", 'data: {"n":2}'].join("\n")}\n`;
    const out: unknown[] = [];
    await expect(async () => {
      for await (const item of parseOpenAiSse(sseBody(text))) {
        out.push(item);
      }
    }).rejects.toThrow(/SSE.*data payload.*not valid JSON/i);
    // The valid chunk BEFORE the malformed line was already yielded — only the malformed one stops the stream.
    expect(out).toEqual([{ n: 1 }]);
  });

  // The full pipe (#758's actual reproduction): a valid content chunk, a malformed `data:` line, then a
  // terminal chunk. The old behavior skipped the malformed payload and let the remaining stream complete
  // as a SUCCESS — a truncated reply with no error. The fix must reject instead of returning that partial
  // ChatResult as success, and a fully-valid stream (the reducer's other tests) must remain unchanged.
  test("a malformed data: payload rejects the reducer instead of completing as a partial success (#758)", async () => {
    const text = `${[
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      "data: not-json-here",
      'data: {"choices":[{"finishReason":"stop"}]}',
      "data: [DONE]",
    ].join("\n")}\n`;
    const stream = parseOpenAiSse(sseBody(text)) as AsyncGenerator<ChatCompletionStreamChunk>;
    await expect(reduceChatCompletionStream(stream)).rejects.toThrow(/SSE.*data payload.*not valid JSON/i);
  });

  test("flushes a final unterminated `data:` line at EOF (no trailing newline)", async () => {
    // A spec-sloppy BYO endpoint ends the stream with the terminal usage/finish chunk and no `\n`.
    const tailPayload = `{"usage":{"prompt_tokens":10},"finish_reason":"stop"}`;
    const text = `data: {"n":1}\ndata: ${tailPayload}`;
    const out: unknown[] = [];
    for await (const item of parseOpenAiSse(sseBody(text))) {
      out.push(item);
    }
    // Raw snake_case wire payload — build via JSON.parse so no snake_case identifiers appear in source.
    expect(out).toEqual([{ n: 1 }, JSON.parse(tailPayload)]);
  });
});

describe("the D48 tool-call delta accumulator (T2 — tool-use-design/02 §6)", () => {
  test("assembles arguments split MID-TOKEN across fragments (string concat, never incremental parse)", async () => {
    const view = await reduceChatCompletionStream(
      streamOf([
        chunkWithToolCalls([{ index: 0, id: "call_1", function: { name: "tick_clock" } }]),
        chunkWithToolCalls([{ index: 0, function: { arguments: '{"minu' } }]),
        chunkWithToolCalls([{ index: 0, function: { arguments: 'tes":30}' } }]),
        { choices: [{ delta: {}, finishReason: "tool_calls" }] },
      ]),
    );
    expect(view.choices?.[0]?.message?.toolCalls).toEqual([{ id: "call_1", function: { name: "tick_clock", arguments: '{"minutes":30}' } }]);
  });

  test("interleaves multiple calls by index; emission order = ascending index", async () => {
    const view = await reduceChatCompletionStream(
      streamOf([
        chunkWithToolCalls([
          { index: 1, id: "call_b", function: { name: "b", arguments: "{" } },
          { index: 0, id: "call_a", function: { name: "a", arguments: "{}" } },
        ]),
        chunkWithToolCalls([{ index: 1, function: { arguments: "}" } }]),
        TERMINAL_CHUNK,
      ]),
    );
    expect(view.choices?.[0]?.message?.toolCalls).toEqual([
      { id: "call_a", function: { name: "a", arguments: "{}" } },
      { id: "call_b", function: { name: "b", arguments: "{}" } },
    ]);
  });

  test("latches id/name on FIRST sight — later repeats/omissions never clobber", async () => {
    const view = await reduceChatCompletionStream(
      streamOf([
        chunkWithToolCalls([{ index: 0, id: "call_first", function: { name: "real" } }]),
        chunkWithToolCalls([{ index: 0, id: "call_second", function: { name: "fake", arguments: "{}" } }]),
        TERMINAL_CHUNK,
      ]),
    );
    expect(view.choices?.[0]?.message?.toolCalls).toEqual([{ id: "call_first", function: { name: "real", arguments: "{}" } }]);
  });

  test("a tool-less stream carries NO toolCalls key (absence discipline) and 'tool_calls' normalizes to 'tool'", async () => {
    const bare = await reduceChatCompletionStream(streamOf([{ choices: [{ delta: { content: "hi" }, finishReason: "stop" }] }]));
    expect(bare.choices?.[0]?.message).not.toHaveProperty("toolCalls");

    const withCalls = await reduceChatCompletionStream(
      streamOf([
        chunkWithToolCalls([{ index: 0, id: "c", function: { name: "n", arguments: "{}" } }]),
        { choices: [{ delta: {}, finishReason: "tool_calls" }] },
      ]),
    );
    const turn = mapChatCompletionToTurnResult(withCalls, {
      model: "m",
      startedAt: 0,
      now: 1,
      contextWindow: null,
      maxOutputTokens: null,
    });
    expect(turn.finishReason).toBe("tool");
    expect(turn.toolCalls).toEqual([{ toolCallId: "c", name: "n", arguments: "{}" }]);

    const bareTurn = mapChatCompletionToTurnResult(bare, {
      model: "m",
      startedAt: 0,
      now: 1,
      contextWindow: null,
      maxOutputTokens: null,
    });
    expect(bareTurn).not.toHaveProperty("toolCalls");
  });
});

describe("reduceChatCompletionStream — truncation fails closed (#1400)", () => {
  test("a stream that ends after deltas WITHOUT a finish reason is a typed provider error, not a short reply", async () => {
    // The defect: a provider/proxy/transport that emits content and then closes produced a normal success
    // whose finishReason was null — the engine committed that partial text as the finished reply, and nothing
    // downstream could tell it from a genuinely short one.
    const reduced = reduceChatCompletionStream(streamOf([{ choices: [{ delta: { content: "half a sen" } }] }]));
    await expect(reduced).rejects.toThrow(TRUNCATED_ERROR);
  });

  test("the refusal is retryable (nothing was committed) and names the truncation as its terminal reason", async () => {
    const err: unknown = await reduceChatCompletionStream(streamOf([{ choices: [{ delta: { content: "x" } }] }])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
    expect((err as ProviderError).terminalReason).toBe("stream_truncated");
  });

  test("an EMPTY stream is truncation too — a turn that produced nothing at all never terminated", async () => {
    await expect(reduceChatCompletionStream(streamOf([]))).rejects.toThrow(TRUNCATED_ERROR);
  });

  test("CONTROL: the same content WITH a terminal chunk still reduces to a success", async () => {
    const view = await reduceChatCompletionStream(streamOf([{ choices: [{ delta: { content: "half a sen" } }] }, TERMINAL_CHUNK]));
    expect(view.choices?.[0]?.message?.content).toBe("half a sen");
    expect(view.choices?.[0]?.finishReason).toBe("stop");
  });
});
