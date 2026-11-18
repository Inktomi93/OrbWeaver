// @subject packages/inference/src/backends/v4/stream.ts
// The V4 fold drops a tool-input triple by contract — the terminal `tool-call` part is mandatory — so a stream
// that sends the deltas and no call must fail loudly instead of committing a prose-only turn.
import { expect, test } from "@orb/testkit/node";
import { drainStream } from "#inference/backends/v4/stream.ts";

type StreamPart = Parameters<typeof drainStream>[0] extends ReadableStream<infer T> ? T : never;

const USAGE = {
  inputTokens: { total: 11, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 4, text: 4, reasoning: undefined },
} as const;

const FINISH = { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE } as const;

// A real tool call arrives as a triple of argument deltas followed by the terminal `tool-call` part.
const TOOL_INPUT_TRIPLE = [
  { type: "tool-input-start", id: "call-1", toolName: "lookup" },
  { type: "tool-input-delta", id: "call-1", delta: '{"q":"x"}' },
  { type: "tool-input-end", id: "call-1" },
] as const;

const TERMINAL_CALL = { type: "tool-call", toolCallId: "call-1", toolName: "lookup", input: '{"q":"x"}' } as const;

function drain(parts: readonly StreamPart[]): ReturnType<typeof drainStream> {
  const stream = new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
  return drainStream(stream, { label: "fixture" });
}

test("a tool-input triple with no terminal tool-call fails loudly", async () => {
  await expect(drain([...TOOL_INPUT_TRIPLE, FINISH])).rejects.toThrow(
    /sent tool-input deltas for "lookup" \(tool-call id "call-1"\) but no terminal tool-call part/u,
  );
});

test("the same triple with its terminal tool-call resolves to the call", async () => {
  const drained = await drain([...TOOL_INPUT_TRIPLE, TERMINAL_CALL, FINISH]);
  expect(drained.toolCalls.map((call) => call.name)).toEqual(["lookup"]);
});

test("argument deltas for an id the stream never opened fail loudly too", async () => {
  await expect(drain([{ type: "tool-input-delta", id: "call-2", delta: "{}" }, FINISH])).rejects.toThrow(
    /sent tool-input deltas for tool-call id "call-2" but no terminal tool-call part/u,
  );
});

// Two calls to the SAME tool are two ids. A name-keyed check would accept the second triple's deltas on the
// strength of the first call, and the truncated call would vanish without a trace.
test("a second call to an already-completed tool name still needs its own terminal call", async () => {
  await expect(
    drain([
      ...TOOL_INPUT_TRIPLE,
      TERMINAL_CALL,
      { type: "tool-input-start", id: "call-2", toolName: "lookup" },
      { type: "tool-input-delta", id: "call-2", delta: '{"q":"y"}' },
      FINISH,
    ]),
  ).rejects.toThrow(/sent tool-input deltas for "lookup" \(tool-call id "call-2"\) but no terminal tool-call part/u);
});
