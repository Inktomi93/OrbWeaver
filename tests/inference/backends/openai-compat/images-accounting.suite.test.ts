// The installed image SDK discards raw cost/details and returns its requested model as response.modelId.
// These real SDK response fixtures pin the normalized facts, not a reconstructed provider invoice.

import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import { runOpenAiCompatGenerateImage } from "../../../../packages/inference/src/backends/openai-compat/images.ts";
import { makeCapability, makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../_support.ts";

test.for([
  { cost: null, sourceId: "image-chat-source", expectedSource: "image-chat-source" },
  { cost: 0.125, sourceId: "image-chat-source", expectedSource: "image-chat-source" },
  { cost: 0.125, sourceId: "fixture-key", expectedSource: null },
])("actual image-output chat SDK cost $cost/source $sourceId preserves normalized facts without credential bytes", async ({
  cost,
  sourceId,
  expectedSource,
}) => {
  const connection = fakeResolved({
    task: "generateImage",
    providerId: "openrouter",
    model: "google/gemini-image",
    capability: makeCapability(makeGenerationCapability()),
    secret: fakeApiKeySecret("fixture-key"),
    declaredFeatures: { images: "chat-modalities" },
  });
  const deps = fakeDeps();
  const paths: string[] = [];
  const result = await runOpenAiCompatGenerateImage(
    { connection, prompt: "A lighthouse." },
    {
      normalize: passthroughImageNormalizer,
      transport: {
        app: deps.app,
        fetch: (input) => {
          paths.push(new URL(String(input)).pathname);
          return Promise.resolve(
            Response.json(
              {
                id: "gen-image",
                created: 1,
                model: "served-image-chat",
                choices: [
                  {
                    index: 0,
                    ["finish_reason"]: "stop",
                    message: { role: "assistant", content: null, images: [{ type: "image_url", ["image_url"]: { url: "data:image/png;base64,AQID" } }] },
                  },
                ],
                usage: {
                  ["prompt_tokens"]: 70,
                  ["completion_tokens"]: 1434,
                  ["total_tokens"]: 1504,
                  ...(cost === null ? {} : { cost }),
                  ["completion_tokens_details"]: { ["reasoning_tokens"]: 0, ["image_tokens"]: 1120 },
                },
              },
              {
                headers: {
                  "x-openrouter-cache-status": "HIT",
                  "x-openrouter-cache-source-id": sourceId,
                  "x-openrouter-cache-age": "0",
                  "x-openrouter-cache-ttl": "240",
                },
              },
            ),
          );
        },
      },
    },
  );
  expect(paths).toEqual(["/api/v1/chat/completions"]);
  expect(result.images).toMatchObject([{ base64: "AQID", mediaType: "image/png" }]);
  expect(result.usage).toMatchObject({
    tokensIn: 70,
    tokensOut: 1434,
    servedModel: "served-image-chat",
    costUsd: cost ?? 0,
    costProvenance: "measured",
    tokenDetails: { output: [{ modality: "image", tokens: 1120 }] },
    responseCache: { status: "hit", sourceGenerationId: expectedSource, ageSeconds: 0, ttlSeconds: 240 },
  });
});

test.for([
  0,
  0.125,
  null,
])("actual OpenRouter images API reported cost %s and partial usage survive SDK loss without a requested served-model claim", async (cost) => {
  const connection = fakeResolved({
    task: "generateImage",
    providerId: "openrouter",
    model: "openai/gpt-image-2.5",
    capability: makeCapability(makeGenerationCapability()),
    secret: fakeApiKeySecret("fixture-key"),
    declaredFeatures: { images: "images-api" },
  });
  const paths: string[] = [];
  const deps = fakeDeps();
  const result = await runOpenAiCompatGenerateImage(
    { connection, prompt: "A lighthouse." },
    {
      normalize: passthroughImageNormalizer,
      transport: {
        app: deps.app,
        fetch: (input) => {
          paths.push(new URL(String(input)).pathname);
          return Promise.resolve(
            Response.json({
              data: [{ b64_json: "AQID" }],
              usage: {
                ["prompt_tokens"]: 70,
                ["completion_tokens"]: 1434,
                ["total_tokens"]: 1504,
                ...(cost === null ? {} : { cost }),
                ["completion_tokens_details"]: { ["image_tokens"]: 1120 },
              },
            }),
          );
        },
      },
    },
  );
  expect(paths).toEqual(["/api/v1/images"]);
  expect(result.images).toEqual([{ url: undefined, base64: "AQID", mediaType: "image/png" }]);
  expect(result.usage).toMatchObject({
    tokensIn: 70,
    tokensOut: 1434,
    reasoningTokens: null,
    servedModel: null,
    tokenDetails: { output: [{ modality: "image", tokens: 1120 }] },
    costUsd: cost,
    costProvenance: cost === null ? "unrecorded" : "measured",
  });
});

test("native images API preserves reported zero and independent text/image detail without SDK model placeholder or missing cache counts", async () => {
  const connection = fakeResolved({
    task: "generateImage",
    providerId: "openai",
    model: "gpt-image-2.5",
    capability: makeCapability(makeGenerationCapability()),
    secret: fakeApiKeySecret("fixture-key"),
    declaredFeatures: { images: "images-api" },
  });
  const deps = fakeDeps();
  const paths: string[] = [];
  const result = await runOpenAiCompatGenerateImage(
    { connection, prompt: "A lighthouse." },
    {
      normalize: passthroughImageNormalizer,
      transport: {
        app: deps.app,
        fetch: (input) => {
          paths.push(new URL(String(input)).pathname);
          return Promise.resolve(
            Response.json({
              data: [{ b64_json: "AQID" }],
              usage: {
                ["input_tokens"]: 0,
                ["output_tokens"]: 20,
                ["total_tokens"]: 20,
                ["input_tokens_details"]: { ["text_tokens"]: 0, ["image_tokens"]: 0 },
                ["output_tokens_details"]: { ["text_tokens"]: 4, ["image_tokens"]: 16 },
              },
            }),
          );
        },
      },
    },
  );
  expect(paths).toEqual(["/v1/images/generations"]);
  expect(result.usage).toMatchObject({
    tokensIn: 0,
    tokensOut: 20,
    servedModel: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    tokenDetails: {
      input: [
        { modality: "text", tokens: 0 },
        { modality: "image", tokens: 0 },
      ],
      output: [
        { modality: "text", tokens: 4 },
        { modality: "image", tokens: 16 },
      ],
    },
    costUsd: null,
    costProvenance: "unrecorded",
  });
});

test.for([
  { cost: 0.25, upstream: 0.5, byok: true, expected: 0.75 },
  { cost: 0.25, upstream: null, byok: true, expected: null },
  { cost: -1, upstream: null, byok: false, expected: null },
  { cost: "invalid", upstream: null, byok: false, expected: null },
])("SDK-accepted optional image cost $cost / BYOK $byok preserves independent usage and reports complete price $expected", async ({
  cost,
  upstream,
  byok,
  expected,
}) => {
  const connection = fakeResolved({
    task: "generateImage",
    providerId: "openrouter",
    model: "openai/gpt-image-2.5",
    capability: makeCapability(makeGenerationCapability()),
    secret: fakeApiKeySecret("fixture-key"),
    declaredFeatures: { images: "images-api" },
  });
  const deps = fakeDeps();
  const result = await runOpenAiCompatGenerateImage(
    { connection, prompt: "A lighthouse." },
    {
      normalize: passthroughImageNormalizer,
      transport: {
        app: deps.app,
        fetch: () =>
          Promise.resolve(
            Response.json({
              data: [{ b64_json: "AQID" }],
              usage: {
                ["prompt_tokens"]: 70,
                ["completion_tokens"]: 1434,
                ["total_tokens"]: 1504,
                cost,
                ["is_byok"]: byok,
                ["cost_details"]: {
                  ["upstream_inference_cost"]: upstream,
                  ["upstream_inference_prompt_cost"]: -1,
                  ["upstream_inference_completions_cost"]: 0.5,
                },
                ["completion_tokens_details"]: { ["reasoning_tokens"]: -1, ["image_tokens"]: 1120 },
              },
            }),
          ),
      },
    },
  );
  expect(result.images).toHaveLength(1);
  expect(result.usage).toMatchObject({
    tokensIn: 70,
    tokensOut: 1434,
    reasoningTokens: null,
    costUsd: expected,
    tokenDetails: { output: [{ modality: "image", tokens: 1120 }] },
    costProvenance: expected === null ? "unrecorded" : "measured",
  });
  expect(result.usage.costDetails?.promptUsd).toBeUndefined();
});
