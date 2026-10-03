// curated/local-servers — the sampler set each local server row states, whatever model it runs. These pins are
// the capability gate's input: a knob shows in the preset deck and rides the wire only where this set states
// it, and every stage a server orders must have a token in the order vocabulary its provider row names.

import type { GenerationCapability, SamplingCapability } from "@orb/contracts/inference";
import { builtinProvider, foldFeatures, SAMPLER_ORDER_TOKENS } from "@orb/contracts/inference";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testProviderId } from "../../../../support/inference-identities.ts";

const LOCAL_SERVERS = ["llama-cpp", "koboldcpp", "ollama", "lm-studio", "vllm", "custom-openai"] as const;

function generationOf(providerId: string, model: string): GenerationCapability {
  const { capability } = synthesizeCapability("generation", "other", {
    curated: curatedRows({ model, providerId: testProviderId(providerId), wire: "openai-compat" }),
  });
  if (capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return capability.generation;
}

function statedKnobs(sampling: SamplingCapability): readonly string[] {
  return Object.keys(sampling).toSorted();
}

test("every local server states a sampler set; the floor no longer leaves them empty", () => {
  for (const providerId of LOCAL_SERVERS) {
    expect(statedKnobs(generationOf(providerId, "any-model").sampling).length, providerId).toBeGreaterThan(0);
  }
});

test("the server's set wins over a model family's: a Qwen or Gemma model on llama.cpp gets llama.cpp's samplers", () => {
  const plain = statedKnobs(generationOf("llama-cpp", "any-model").sampling);
  expect(statedKnobs(generationOf("llama-cpp", "Qwen/Qwen3-8B-GGUF").sampling)).toEqual(plain);
  expect(statedKnobs(generationOf("llama-cpp", "gemma-3-27b-it").sampling)).toEqual(plain);
});

test("the gate differs per server: DRY on llama.cpp and KoboldCpp, not on Ollama or vLLM", () => {
  expect(generationOf("llama-cpp", "m").sampling.dryMultiplier).toBeDefined();
  expect(generationOf("koboldcpp", "m").sampling.dryMultiplier).toBeDefined();
  expect(generationOf("ollama", "m").sampling.dryMultiplier).toBeUndefined();
  expect(generationOf("vllm", "m").sampling.dryMultiplier).toBeUndefined();
  // KoboldCpp reads frequency_penalty only as a presence-penalty stand-in, so it never states the knob.
  expect(generationOf("koboldcpp", "m").sampling.frequencyPenalty).toBeUndefined();
  expect(generationOf("koboldcpp", "m").sampling.smoothingFactor).toBeDefined();
  expect(generationOf("llama-cpp", "m").sampling.smoothingFactor).toBeUndefined();
});

test("every stage a server orders has a token in the vocabulary its provider row names", () => {
  const mismatches = LOCAL_SERVERS.flatMap((providerId) => {
    const stages = generationOf(providerId, "m").sampling.samplerOrder ?? [];
    const vocabulary = foldFeatures(builtinProvider(providerId)?.features).samplerOrder;
    const tokens = vocabulary === undefined ? {} : SAMPLER_ORDER_TOKENS[vocabulary].tokens;
    const unspelled = stages.filter((stage) => !(stage in tokens)).map((stage) => `${providerId}:${stage}`);
    const orphanVocabulary = vocabulary !== undefined && stages.length === 0 ? [`${providerId}:vocabulary-without-stages`] : [];
    return [...unspelled, ...orphanVocabulary];
  });
  expect(mismatches).toEqual([]);
  expect(generationOf("llama-cpp", "m").sampling.samplerOrder).toBeDefined();
  expect(generationOf("koboldcpp", "m").sampling.samplerOrder).toBeDefined();
});

test("behind a Custom endpoint a model family's stated sampling wins; only an unknown model gets the vLLM set", () => {
  // A Custom endpoint is often a proxy (LiteLLM, Azure) to a hosted family whose own rows state its set.
  const familyOnly = (model: string): SamplingCapability => {
    const rows = curatedRows({ model, providerId: testProviderId("custom-openai"), wire: "openai-compat" }).filter(
      (row) => row.match?.provider !== "custom-openai",
    );
    const { capability } = synthesizeCapability("generation", "other", { curated: rows });
    return capability.kind === "generation" ? capability.generation.sampling : {};
  };
  for (const model of ["gpt-5-mini", "claude-opus-5", "gemini-3-flash-preview"]) {
    expect(generationOf("custom-openai", model).sampling, model).toEqual(familyOnly(model));
  }
  expect(generationOf("custom-openai", "gpt-5-mini").sampling.temperature).toBeUndefined();
  expect(generationOf("custom-openai", "gpt-5-mini").sampling.topK).toBeUndefined();
  // vLLM's phrase and EOS bans ride under vLLM's own spellings, so a Custom endpoint is not told it has them.
  const vllmBans = new Set(["bannedStrings", "banEos"]);
  expect(statedKnobs(generationOf("custom-openai", "some-finetune-7b").sampling)).toEqual(
    statedKnobs(generationOf("vllm", "some-finetune-7b").sampling).filter((knob) => !vllmBans.has(knob)),
  );
});

test("an embedder served by llama.cpp keeps its embedding capability: the rows state generation sampling only", () => {
  const { capability } = synthesizeCapability("embedding", "other", {
    curated: curatedRows({ model: "nomic-embed", providerId: testProviderId("llama-cpp") }),
  });
  expect(capability.kind).toBe("embedding");
});
