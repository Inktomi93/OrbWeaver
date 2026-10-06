import { passthroughImageNormalizer } from "../../../../packages/inference/src/backends/kit/image-normalize.ts";
import { runOpenAiCompatGenerateImage } from "../../../../packages/inference/src/backends/openai-compat/images.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";

test.each(["images-api", "chat-modalities"] as const)("OpenRouter %s image generation bypasses response replay at its actual SDK endpoint", async (arm) => {
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
  const sdkFetch: typeof fetch = (input, init) => {
    requests.push(new Request(input, init));
    return Promise.resolve(
      Response.json(
        arm === "images-api"
          ? { data: [{ b64_json: "aW1hZ2U=" }], usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 } }
          : {
              id: "gen-image",
              created: 1,
              model,
              choices: [
                {
                  index: 0,
                  finish_reason: "stop",
                  message: { role: "assistant", content: null, images: [{ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] },
                },
              ],
              usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 },
            },
      ),
    );
  };
  const deps = fakeDeps();
  const result = await runOpenAiCompatGenerateImage(
    { connection, prompt: "Draw a lighthouse" },
    { transport: { fetch: sdkFetch, app: deps.app }, normalize: passthroughImageNormalizer },
  );
  expect(result.images).toMatchObject([{ base64: "aW1hZ2U=", mediaType: "image/png" }]);
  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(new URL(request?.url ?? "").pathname).toBe(arm === "images-api" ? "/api/v1/images" : "/api/v1/chat/completions");
  expect(request?.headers.get("x-openrouter-cache")).toBe("false");
  expect(request?.headers.has("x-openrouter-cache-clear")).toBe(false);
  expect(request?.headers.get("x-trace-control")).toBe("kept");
  const body = await request?.json();
  expect(body).toMatchObject({ model });
});
