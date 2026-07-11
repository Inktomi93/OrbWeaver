// biome-ignore-all lint/style/useNamingConvention: snake_case wire fields (input_tokens, stop_reason,
// cache_read_input_tokens, content_block) are the real Anthropic Messages stream events, not orb identifiers.
//
// backends/anth-direct reducer — drain a fake `Stream<RawMessageStreamEvent>` into the accumulated turn:
// text → reply, thinking → reasoning, redacted_thinking → the withheld flag, usage split across
// message_start (input/cache) + message_delta (output), stop_reason, ttft on the first delta, onDelta fired.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatDeltaEvent } from "@orb/server/infra/providers";
import { reduceAnthStream } from "@orb/server/infra/providers/backends/anth-direct";
import { describe } from "vitest";
import { anthEvent, anthStream } from "../../../../../support/factories/anth-wire.ts";
import { expect, test } from "../../../../../support/fixtures";

const CHAT_ID = castId<ChatId>("chat-1");

// A monotonic clock so ttft is deterministic (each read advances by 10ms).
function stepClock(start: number, step: number): () => number {
  let t = start;
  return (): number => {
    const now = t;
    t += step;
    return now;
  };
}

describe("reduceAnthStream", () => {
  test("accumulates text into reply, tracks usage split + stop_reason, fires onDelta per text delta", async () => {
    const deltas: ChatDeltaEvent[] = [];
    const events = [
      anthEvent({
        type: "message_start",
        message: {
          id: "m1",
          type: "message",
          role: "assistant",
          content: [],
          model: "anthropic/claude-opus-4-5",
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 100,
            output_tokens: 0,
            cache_read_input_tokens: 40,
            cache_creation_input_tokens: 20,
          },
        },
      }),
      anthEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      anthEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello" },
      }),
      anthEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: " world" },
      }),
      anthEvent({ type: "content_block_stop", index: 0 }),
      anthEvent({
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 12 },
      }),
      anthEvent({ type: "message_stop" }),
    ];
    const reduced = await reduceAnthStream(anthStream(events), {
      chatId: CHAT_ID,
      startedAt: 1000,
      now: stepClock(1000, 10),
      onDelta: (event) => deltas.push(event),
    });
    expect(reduced.reply).toBe("Hello world");
    expect(reduced.reasoning).toBe("");
    expect(reduced.reasoningRedacted).toBe(false);
    expect(reduced.stopReason).toBe("end_turn");
    expect(reduced.inputTokens).toBe(100);
    expect(reduced.outputTokens).toBe(12);
    expect(reduced.cacheReadTokens).toBe(40);
    expect(reduced.cacheWriteTokens).toBe(20);
    // ttft set on the FIRST delta (not null).
    expect(reduced.firstDeltaAt).not.toBeNull();
    // onDelta fired once per text delta, tagged text.
    expect(deltas).toEqual([
      { chatId: CHAT_ID, kind: "text", text: "Hello" },
      { chatId: CHAT_ID, kind: "text", text: " world" },
    ]);
  });

  test("routes thinking deltas to reasoning (kind:reasoning), NOT reply", async () => {
    const deltas: ChatDeltaEvent[] = [];
    const events = [
      anthEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "", signature: "" },
      }),
      anthEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Let me think" },
      }),
      anthEvent({
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
      }),
      anthEvent({
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "Answer" },
      }),
    ];
    const reduced = await reduceAnthStream(anthStream(events), {
      chatId: CHAT_ID,
      startedAt: 0,
      now: stepClock(0, 10),
      onDelta: (event) => deltas.push(event),
    });
    expect(reduced.reasoning).toBe("Let me think");
    expect(reduced.reply).toBe("Answer");
    expect(deltas[0]).toEqual({ chatId: CHAT_ID, kind: "reasoning", text: "Let me think" });
  });

  test("a redacted_thinking block sets reasoningRedacted (encrypted CoT, no visible text)", async () => {
    const events = [
      anthEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "redacted_thinking", data: "enc" },
      }),
      anthEvent({
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
      }),
      anthEvent({
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "Hi" },
      }),
    ];
    const reduced = await reduceAnthStream(anthStream(events), {
      chatId: CHAT_ID,
      startedAt: 0,
      now: stepClock(0, 10),
    });
    expect(reduced.reasoningRedacted).toBe(true);
    expect(reduced.reasoning).toBe("");
    expect(reduced.reply).toBe("Hi");
  });

  test("an empty stream yields a coherent zero-shape (no throw, stopReason null, ttft null)", async () => {
    const reduced = await reduceAnthStream(anthStream([]), {
      chatId: CHAT_ID,
      startedAt: 0,
      now: stepClock(0, 10),
    });
    expect(reduced.reply).toBe("");
    expect(reduced.stopReason).toBeNull();
    expect(reduced.firstDeltaAt).toBeNull();
    expect(reduced.inputTokens).toBe(0);
    expect(reduced.outputTokens).toBe(0);
  });

  test("onChunk fires on EVERY event (the idle-window reset)", async () => {
    let chunks = 0;
    const events = [
      anthEvent({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      anthEvent({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "x" },
      }),
      anthEvent({ type: "message_stop" }),
    ];
    await reduceAnthStream(anthStream(events), {
      chatId: CHAT_ID,
      startedAt: 0,
      now: stepClock(0, 10),
      onChunk: () => {
        chunks += 1;
      },
    });
    expect(chunks).toBe(3);
  });
});
