// The advertised partial from an endpoint row: only what the server's list or native model info stated, shaped
// by the row's kind (D292). An embedding row states its width and nothing a chat model would; a generation row
// states its window, modalities, tools and schema-constrained output only when the row carries them.

import { advertisedFromOpenAiCompat, advertisedStatesInput } from "../../../../../packages/inference/src/capability/sources/advertised/openai-compat.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A row that spells every sampler the default way. */
const ROW = {};

test("a generation row states exactly the facts its server reported", () => {
  expect(
    advertisedFromOpenAiCompat(
      { contextLength: 4096, embeddingDims: 896, input: ["text", "image"], tools: { parallel: true }, structured: true },
      "generation",
      ROW,
    ),
  ).toStrictEqual({ context: { window: 4096 }, input: ["text", "image"], tools: { parallel: true }, output: { structured: true } });
  // A row the native API never described states only its window; nothing about modalities, tools or output.
  expect(advertisedFromOpenAiCompat({ contextLength: 32_768, embeddingDims: undefined }, "generation", ROW)).toStrictEqual({ context: { window: 32_768 } });
  expect(advertisedFromOpenAiCompat({ contextLength: null, embeddingDims: undefined }, "generation", ROW)).toStrictEqual({});
  // A server's default floor for a window it does not state is a guess the capability keeps marked; a stated
  // window wins over it.
  expect(advertisedFromOpenAiCompat({ contextLength: null, contextFloor: 4096 }, "generation", ROW)).toStrictEqual({
    context: { window: 4096, windowEstimated: true },
  });
  expect(advertisedFromOpenAiCompat({ contextLength: 16_384, contextFloor: 4096 }, "generation", ROW)).toStrictEqual({ context: { window: 16_384 } });
  // A server past the floor states structured output; one before it, or one that reported no version, states nothing.
  expect(advertisedFromOpenAiCompat({ contextLength: null, embeddingDims: undefined, structured: false }, "generation", ROW)).toStrictEqual({});
});

test("a model the server says thinks reasons by a switch, so an off can be spelled; one it says nothing about stays unstated", () => {
  expect(advertisedFromOpenAiCompat({ contextLength: null, thinks: true }, "generation", ROW)).toStrictEqual({ reasoning: { mode: "effort", enabled: true } });
  expect(advertisedFromOpenAiCompat({ contextLength: null }, "generation", ROW)).toStrictEqual({});
});

test("an embedding row states its width and never a chat model's facts", () => {
  expect(advertisedFromOpenAiCompat({ contextLength: 2048, embeddingDims: 768, input: ["text"], tools: { parallel: false } }, "embedding", ROW)).toStrictEqual({
    dims: 768,
  });
  expect(advertisedFromOpenAiCompat({ contextLength: 2048, embeddingDims: undefined }, "embedding", ROW)).toStrictEqual({});
  expect(advertisedFromOpenAiCompat({ contextLength: 2048, embeddingDims: 768 }, "rerank", ROW)).toStrictEqual({});
});

test("an embedding row's input limit is its embedding route's, never the generation window; a server floor stays assumed", () => {
  expect(advertisedFromOpenAiCompat({ contextLength: 8192, embeddingDims: 768, embedInputTokens: 512 }, "embedding", ROW)).toStrictEqual({
    dims: 768,
    maxInputTokens: 512,
  });
  expect(advertisedFromOpenAiCompat({ contextLength: null, contextFloor: 4096 }, "embedding", ROW)).toStrictEqual({
    maxInputTokens: 4096,
    windowEstimated: true,
  });
  expect(advertisedFromOpenAiCompat({ contextLength: null, contextFloor: 4096, embedInputTokens: 2048 }, "embedding", ROW)).toStrictEqual({
    maxInputTokens: 2048,
  });
});

test("the posture reads whether the server stated an input list, not what it listed", () => {
  expect(advertisedStatesInput({ input: ["text"] })).toBe(true);
  expect(advertisedStatesInput({ input: [] })).toBe(true);
  expect(advertisedStatesInput({ input: undefined })).toBe(false);
  expect(advertisedStatesInput(undefined)).toBe(false);
});

test("the server's sampler defaults land per knob, read under the key this row spells each knob with", () => {
  // llama.cpp's `/props` params: `repeat_penalty` is the llama-cpp row's spelling of the repetition penalty, and a
  // value that is not a number (the `samplers` list) is not a knob default.
  const llamaCpp = { samplerKeys: { repetitionPenalty: "repeat_penalty" } };
  const defaults = { temperature: 0.8, ["top_k"]: 40, ["repeat_penalty"]: 1.1, ["repetition_penalty"]: 9, samplers: ["top_k"], seed: 4_294_967_295 };
  expect(advertisedFromOpenAiCompat({ contextLength: 4096, serverDefaults: defaults }, "generation", llamaCpp)).toStrictEqual({
    context: { window: 4096 },
    samplingDefaults: { temperature: 0.8, topK: 40, repetitionPenalty: 1.1 },
  });
  // The same values on a row that spells the penalty the default way read `repetition_penalty` instead.
  expect(advertisedFromOpenAiCompat({ contextLength: null, serverDefaults: defaults }, "generation", ROW)).toStrictEqual({
    samplingDefaults: { temperature: 0.8, topK: 40, repetitionPenalty: 9 },
  });
});
