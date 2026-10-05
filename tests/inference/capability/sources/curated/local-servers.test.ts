// curated/local-servers — the sampler set each local server row states, whatever model it runs. These pins are
// the capability gate's input: a knob shows in the preset deck and rides the wire only where this set states
// it, and every stage a server orders must have a token in the order vocabulary its provider row names.

import type { GenerationCapability, SamplingCapability } from "@orb/contracts/inference";
import { builtinProvider, foldFeatures, SAMPLER_ORDER_TOKENS } from "@orb/contracts/inference";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
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

// Ollama's `/v1` route fills an omitted temperature and top_p with 1.0, so the Modelfile's own values never run there.
test("Ollama's compat route states the values it sends for an omitted temperature and top_p; the native route states none", () => {
  const route = (nativeChat: "ollama" | "none"): GenerationCapability => {
    const { capability } = synthesizeCapability("generation", "other", {
      curated: curatedRows({ model: "m", providerId: testProviderId("ollama"), wire: "openai-compat", nativeChat }),
      advertised: { samplingDefaults: { temperature: 0.6, topP: 0.95, topK: 20 } },
    });
    if (capability.kind !== "generation") {
      throw new Error("expected a generation capability");
    }
    return capability.generation;
  };
  expect(route("none").routeSamplingDefaults).toEqual({ temperature: 1, topP: 1 });
  expect(route("ollama").routeSamplingDefaults).toBeUndefined();
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
    // Drops only the any-model default; a family's own Custom-route row (Gemini's compatible layer) stays.
    const rows = curatedRows({ model, providerId: testProviderId("custom-openai"), wire: "openai-compat" }).filter(
      (row) => !(row.match?.provider === "custom-openai" && row.match.model === ".*"),
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

test("a hosted model behind a Custom endpoint sends its family's openai-compat samplers, never vLLM's top_k, min_p or repetition_penalty", () => {
  const preset = { temperature: 0.7, topK: 40, minP: 0.05, repetitionPenalty: 1.1 };
  for (const model of ["gpt-4.1", "claude-sonnet-4-6", "claude-opus-4-1"]) {
    const { sampling } = resolveChat(preset, generationOf("custom-openai", model));
    expect(Object.keys(sampling).toSorted(), model).toEqual(["temperature"]);
  }
  // An unknown model behind the same endpoint still gets the vLLM set.
  expect(Object.keys(resolveChat(preset, generationOf("custom-openai", "some-finetune-7b")).sampling).toSorted()).toEqual([
    "minP",
    "repetitionPenalty",
    "temperature",
    "topK",
  ]);
});

test("an embedder served by llama.cpp keeps its embedding capability: the rows state generation sampling only", () => {
  const { capability } = synthesizeCapability("embedding", "other", {
    curated: curatedRows({ model: "nomic-embed", providerId: testProviderId("llama-cpp") }),
  });
  expect(capability.kind).toBe("embedding");
});
