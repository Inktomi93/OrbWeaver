// The advertised partial from an endpoint row: only what the server's list or native model info stated, shaped
// by the row's kind (D292). An embedding row states its width and nothing a chat model would; a generation row
// states its window, modalities, tools and schema-constrained output only when the row carries them.

import { advertisedFromOpenAiCompat, advertisedStatesInput } from "../../../../../packages/inference/src/capability/sources/advertised/openai-compat.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a generation row states exactly the facts its server reported", () => {
  expect(
    advertisedFromOpenAiCompat(
      { contextLength: 4096, embeddingDims: 896, input: ["text", "image"], tools: { parallel: true }, structured: true },
      "generation",
    ),
  ).toStrictEqual({ context: { window: 4096 }, input: ["text", "image"], tools: { parallel: true }, output: { structured: true } });
  // A row the native API never described states only its window; nothing about modalities, tools or output.
  expect(advertisedFromOpenAiCompat({ contextLength: 32_768, embeddingDims: undefined }, "generation")).toStrictEqual({ context: { window: 32_768 } });
  expect(advertisedFromOpenAiCompat({ contextLength: null, embeddingDims: undefined }, "generation")).toStrictEqual({});
  // A server's default floor for a window it does not state is a guess the capability keeps marked; a stated
  // window wins over it.
  expect(advertisedFromOpenAiCompat({ contextLength: null, contextFloor: 4096 }, "generation")).toStrictEqual({
    context: { window: 4096, windowEstimated: true },
  });
  expect(advertisedFromOpenAiCompat({ contextLength: 16_384, contextFloor: 4096 }, "generation")).toStrictEqual({ context: { window: 16_384 } });
  // A server past the floor states structured output; one before it, or one that reported no version, states nothing.
  expect(advertisedFromOpenAiCompat({ contextLength: null, embeddingDims: undefined, structured: false }, "generation")).toStrictEqual({});
});

test("an embedding row states its width and never a chat model's facts", () => {
  expect(advertisedFromOpenAiCompat({ contextLength: 2048, embeddingDims: 768, input: ["text"], tools: { parallel: false } }, "embedding")).toStrictEqual({
    dims: 768,
  });
  expect(advertisedFromOpenAiCompat({ contextLength: 2048, embeddingDims: undefined }, "embedding")).toStrictEqual({});
  expect(advertisedFromOpenAiCompat({ contextLength: 2048, embeddingDims: 768 }, "rerank")).toStrictEqual({});
});

test("the posture reads whether the server stated an input list, not what it listed", () => {
  expect(advertisedStatesInput({ input: ["text"] })).toBe(true);
  expect(advertisedStatesInput({ input: [] })).toBe(true);
  expect(advertisedStatesInput({ input: undefined })).toBe(false);
  expect(advertisedStatesInput(undefined)).toBe(false);
});
