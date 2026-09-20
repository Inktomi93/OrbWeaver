// backends/anthropic-messages/refusal — the classifier-block fold onto the EXISTING `refusal` ChatEvent (A5).
// Shapes are the SDK's own (`mapAnthropicStopDetails`, `@ai-sdk/anthropic/dist/index.js:6140-6150`; the
// `iterations` map at :5862-5875): a Fable safety block is a 200 with the V4 finish `content-filter`,
// `stopDetails` when the API attached one, and a `fallback_message` iteration when `fallbacks` retried
// server-side. The fold branches on the FINISH REASON (the vendored doc's rule: the API may refuse with no
// details at all), never on `stop_details` presence.

import { refusalEventOf } from "../../../../packages/inference/src/backends/anthropic-messages/refusal.ts";
import type { StreamDrain } from "../../../../packages/inference/src/backends/v4/stream.ts";
import { expect, test } from "../../../support/fixtures.ts";

function drainOf(overrides: Partial<StreamDrain>): StreamDrain {
  return {
    reply: "",
    reasoning: "",
    reasoningParts: [],
    toolCalls: [],
    images: [],
    finish: { unified: "stop", raw: "end_turn" },
    usage: undefined,
    providerMetadata: undefined,
    responseId: "msg_1",
    warnings: [],
    ...overrides,
  };
}

const BLOCKED: StreamDrain["finish"] = { unified: "content-filter", raw: "refusal" };

test("a classifier block with details becomes the refusal member with its category and explanation", () => {
  const drain = drainOf({
    finish: BLOCKED,
    providerMetadata: {
      anthropic: {
        usage: { input_tokens: 10 },
        stopSequence: null,
        stopDetails: { type: "refusal", category: "cyber", explanation: "blocked under the Usage Policy" },
        iterations: null,
      },
    },
  });
  expect(refusalEventOf(drain, "claude-fable-5-1", 1000)).toEqual({
    kind: "refusal",
    at: 1000,
    model: "claude-fable-5-1",
    category: "cyber",
    explanation: "blocked under the Usage Policy",
    retried: false,
    fallbackModel: null,
  });
});

test("a server-side fallback is read off `iterations` — retried, with the model that answered", () => {
  const drain = drainOf({
    finish: BLOCKED,
    providerMetadata: {
      anthropic: {
        usage: {},
        stopSequence: null,
        stopDetails: { type: "refusal", category: "bio" },
        iterations: [
          { type: "message", model: "claude-fable-5-1", inputTokens: 10, outputTokens: 0 },
          { type: "fallback_message", model: "claude-opus-4-8", inputTokens: 10, outputTokens: 40 },
        ],
      },
    },
  });
  expect(refusalEventOf(drain, "claude-fable-5-1", 5)).toMatchObject({ category: "bio", explanation: null, retried: true, fallbackModel: "claude-opus-4-8" });
});

test("a block with NO details is still a refusal (branch on the finish reason, never on stop_details)", () => {
  expect(
    refusalEventOf(drainOf({ finish: BLOCKED, providerMetadata: { anthropic: { usage: {}, stopSequence: null, iterations: null } } }), "m", 1),
  ).toMatchObject({
    kind: "refusal",
    category: null,
    explanation: null,
    retried: false,
    fallbackModel: null,
  });
  expect(refusalEventOf(drainOf({ finish: BLOCKED }), "m", 1)?.kind).toBe("refusal");
});

test("any other finish is not a refusal — a `stop` with a stray stopDetails blob included", () => {
  expect(refusalEventOf(drainOf({}), "m", 1)).toBeNull();
  expect(refusalEventOf(drainOf({ finish: { unified: "length", raw: "max_tokens" } }), "m", 1)).toBeNull();
  expect(refusalEventOf(drainOf({ providerMetadata: { anthropic: { stopDetails: { type: "refusal", category: "x" } } } }), "m", 1)).toBeNull();
});
