import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { detectModelFamily } from "../../../../../packages/inference/src/capability/families.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function cacheTurns(model: string, provider: string): GenerationCapability["turns"] {
  const { capability } = synthesizeCapability("generation", detectModelFamily(model), {
    curated: curatedRows({ model, providerId: castId<ProviderId>(provider), wire: "openai-compat", api: "chat-completions" }),
  });
  if (capability.kind !== "generation") {
    throw new Error("expected generation");
  }
  return capability.generation.turns;
}

test("Alibaba explicit prefix caching is opt-in only on its documented OpenRouter model routes", () => {
  for (const model of ["qwen/qwen3-max", "qwen/qwen-plus", "qwen/qwen3.6-plus", "qwen/qwen3-coder-plus", "qwen/qwen3-coder-flash"]) {
    expect(cacheTurns(model, "openrouter"), model).toMatchObject({
      explicitPromptCache: true,
      promptCacheFormat: "cache-control",
      fixedCacheTtl: "5m",
      promptCacheDefaultEnabled: false,
    });
  }
  for (const [model, provider] of [
    ["qwen/qwen3.5-plus-02-15", "openrouter"],
    ["qwen/qwen3.5-flash-02-23", "openrouter"],
    ["qwen/qwen3-coder-plus", "custom-openai"],
    ["qwen3-coder-plus", "vllm"],
  ] as const) {
    expect(cacheTurns(model, provider)?.promptCacheFormat, `${provider}:${model}`).toBeUndefined();
  }
});
