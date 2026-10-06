import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import { runOpenAiCompatGenerateImage } from "../../../../packages/inference/src/backends/openai-compat/images.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";

test.for(
  (["images-api", "chat-modalities"] as const).flatMap((arm) =>
    [
      { status: "HIT", cost: 0.125, known: 0.125 },
      { status: "HIT", cost: 0, known: 0 },
      { status: "HIT", cost: undefined, known: 0 },
      { status: "MISS", cost: undefined, known: null },
    ].map((billing) => ({ arm, ...billing })),
  ),
)("fresh image $arm preserves response facts with $status and reported cost $cost", async ({ arm, status, cost, known }) => {
  const model = "openai/gpt-image-test";
  const connection = fakeResolved({
    task: "generateImage",
    providerId: "openrouter",
    model,
    capability: generationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text", "image"] } }),
    secret: fakeApiKeySecret("test-key"),
    declaredFeatures: { images: arm },
    transport: { headers: { "X-OpenRouter-Cache": "true", "X-Trace-Control": "kept" } },
  });
  expect(connection.requirement.ok).toBe(true);
  const requests: Request[] = [];
  const usage = {
    prompt_tokens: 8,
    completion_tokens: 1,
    total_tokens: 9,
    prompt_tokens_details: { text_tokens: 5, ...(arm === "chat-modalities" ? { cached_tokens: 0 } : {}) },
    completion_tokens_details: { image_tokens: 1, ...(arm === "chat-modalities" ? { reasoning_tokens: 0 } : {}) },
    ...(cost === undefined ? {} : { cost }),
  };
  const sdkFetch: typeof fetch = (input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(
      Response.json(
        arm === "images-api"
          ? { data: [{ b64_json: "aW1hZ2U=" }], usage }
          : {
              id: "gen-image",
              created: 1,
              model: "served-image-model",
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  message: { role: "assistant", content: null, images: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] },
                },
              ],
              usage,
            },
        { headers: { "x-openrouter-cache-status": status, "x-openrouter-cache-source-id": "original-image-generation" } },
      ),
    );
  };
  const deps = fakeDeps();
  const result = await runOpenAiCompatGenerateImage(
    { connection, prompt: "Draw a lighthouse" },
    { transport: { fetch: sdkFetch, app: deps.app }, normalize: passthroughImageNormalizer },
  );
  expect(result.images).toMatchObject([{ base64: "aW1hZ2U=", mediaType: "image/png" }]);
  expect(result.model).toBe(model);
  expect(result.usage).toMatchObject({
    tokensIn: 8,
    tokensOut: 1,
    cacheReadTokens: arm === "images-api" ? null : 0,
    cacheWriteTokens: null,
    reasoningTokens: arm === "images-api" ? null : 0,
    servedModel: arm === "images-api" ? null : "served-image-model",
    tokenDetails: { input: [{ modality: "text", tokens: 5 }], output: [{ modality: "image", tokens: 1 }] },
    costUsd: known,
    costProvenance: known === null ? "unrecorded" : "measured",
    responseCache: { status: status.toLowerCase(), sourceGenerationId: "original-image-generation" },
  });
  expect(result.usage.costDetails).toEqual(known === null ? null : { totalUsd: known });
  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(new URL(request?.url ?? "").pathname).toBe(arm === "images-api" ? "/api/v1/images" : "/api/v1/chat/completions");
  expect(request?.headers.get("x-openrouter-cache")).toBe("false");
  expect(request?.headers.has("x-openrouter-cache-clear")).toBe(false);
  expect(request?.headers.get("x-trace-control")).toBe("kept");
  const body = await request?.json();
  expect(body).toMatchObject({ model });
});
