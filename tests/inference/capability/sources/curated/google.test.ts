import type { GenerationCapability } from "@orb/contracts/inference";
import {
  acceptsAssistantPrefill,
  acceptsNamedToolChoice,
  acceptsNoneToolChoice,
  acceptsRequiredToolChoice,
  builtinProvider,
  connectionTasks,
  honoursParallelControl,
  isTurnEstimated,
} from "@orb/contracts/inference";
import { embeddingPrompt } from "../../../../../packages/inference/src/backends/kit/embedding-input.ts";
import { curatedKind, curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testProviderId } from "../../../../support/inference-identities.ts";
import { fakeResolved } from "../../../_support.ts";

test("Gemini model facts share native, OpenRouter and compatibility names", () => {
  for (const [model, providerId, wire] of [
    ["gemini-3-flash-preview", "google", "google-generative-ai"],
    ["google/gemini-3-flash-preview", "openrouter", "openai-compat"],
    ["models/gemini-3-flash-preview", "custom-openai", "openai-compat"],
  ] as const) {
    const capability = synthesizeCapability("generation", "google", {
      curated: curatedRows({ model, providerId: testProviderId(providerId), wire }),
    }).capability;
    expect(capability).toMatchObject({
      kind: "generation",
      generation: {
        input: ["text", "image", "video", "audio", "file"],
        context: { window: 1_048_576 },
        output: { maxTokens: { max: 65_536 }, structured: true },
        reasoning: { mandatory: true },
      },
    });
  }
});

test("embedding family cannot be mistaken for generation and shares its retrieval scaffold across routes", () => {
  for (const model of ["gemini-embedding-2", "google/gemini-embedding-2", "models/gemini-embedding-2-preview"]) {
    const rows = curatedRows({ model });
    expect(curatedKind({ model })).toBe("embedding");
    const capability = synthesizeCapability("embedding", "google", { curated: rows }).capability;
    expect(capability.kind).toBe("embedding");
    if (capability.kind !== "embedding") {
      continue;
    }
    expect(capability.embedding).toMatchObject({ dims: 3072, maxInputTokens: 8192, mrl: true, promptScaffold: "gemini-retrieval" });
    const connection = fakeResolved({ task: "embed", providerId: testProviderId("google"), model, capability });
    expect(embeddingPrompt("words", { connection, input: "words", inputType: "query" }, capability.embedding)).toBe("task: search result | query: words");
    expect(embeddingPrompt("words", { connection, input: "words", inputType: "document" }, capability.embedding)).toBe("title: none | text: words");
  }
});

test("native task admission includes image editing but excludes agent and rerank", () => {
  const provider = builtinProvider("google");
  expect(provider).toBeDefined();
  if (provider === undefined) {
    return;
  }
  expect(connectionTasks(provider, "embedding")).toEqual(["embed", "imageEmbed"]);
  expect(connectionTasks(provider, "generation")).toEqual(["chat", "summarize", "structured", "generateImage"]);
  expect(connectionTasks(provider, "rerank")).toEqual([]);
  const capability = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model: "gemini-3.1-flash-image-preview", providerId: testProviderId("google"), wire: "google-generative-ai" }),
  }).capability;
  expect(capability).toMatchObject({ generation: { imageEdit: true, imageReferences: true, output: { modalities: ["text", "image"] } } });
});

test("older Gemini and non-thinking image models do not inherit thinking; native prefixes are measured per model", () => {
  for (const model of ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.5-flash-image"]) {
    const capability = synthesizeCapability("generation", "google", {
      curated: curatedRows({ model, providerId: testProviderId("google"), wire: "google-generative-ai" }),
    }).capability;
    expect(capability).toMatchObject({ generation: { reasoning: { mode: "none", enabled: false } } });
  }
  const native = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model: "gemini-3-flash-preview", providerId: testProviderId("google"), wire: "google-generative-ai" }),
  }).capability;
  const routed = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model: "google/gemini-3-flash-preview", providerId: testProviderId("openrouter"), wire: "openai-compat" }),
  }).capability;
  expect(native).toMatchObject({ generation: { turns: { assistantPrefill: true, historySystemRows: false, roleHandlingFloor: "strict" } } });
  expect(routed).toMatchObject({ generation: { turns: { assistantPrefill: true } } });
});

const GEMINI_ROUTES = [
  ["", "google", "google-generative-ai"],
  ["models/", "custom-openai", "openai-compat"],
  ["google/", "openrouter", "openai-compat"],
] as const;

test("native and measured OpenRouter Gemini support parallel calls but cannot disable them; forced choices remain available", () => {
  for (const model of ["gemini-3.8-flash", "gemini-3.1-pro-preview"]) {
    const native = geminiOn("", "google", "google-generative-ai", model);
    const routed = geminiOn("google/", "openrouter", "openai-compat", model);
    expect(native.tools?.parallel).toBe(true);
    expect(honoursParallelControl(native)).toBe(false);
    expect(honoursParallelControl(routed)).toBe(false);
    expect(acceptsRequiredToolChoice(native)).toBe(true);
    expect(acceptsNamedToolChoice(native)).toBe(true);
    expect(acceptsNoneToolChoice(native)).toBe(true);
  }
});

test("native GenerateContent implicit support does not enable app markers or invent a resource manager", () => {
  for (const model of ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.1-pro-preview", "gemini-3.8-flash"]) {
    const native = geminiOn("", "google", "google-generative-ai", model);
    expect(native.turns, model).toMatchObject({ providerImplicitPromptCache: true, explicitPromptCache: false, promptCacheDefaultEnabled: false });
    expect(native.turns?.requestAutomaticPromptCache, model).toBeUndefined();
    expect(native.turns?.fixedCacheTtl, model).toBeUndefined();
    const routed = geminiOn("google/", "openrouter", "openai-compat", model);
    expect(routed.turns?.explicitPromptCache, model).toBe(true);
    expect(routed.turns?.fixedCacheTtl, model).toBe("5m");
  }
  expect(geminiOn("models/", "custom-openai", "openai-compat", "gemini-3.8-flash").turns?.providerImplicitPromptCache).toBeUndefined();
});

function geminiOn(prefix: string, providerId: string, wire: "google-generative-ai" | "openai-compat", model: string): GenerationCapability {
  const { capability } = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model: `${prefix}${model}`, providerId: testProviderId(providerId), wire }),
  });
  if (capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return capability.generation;
}

// The hosted family sweep (scripts/probes/hosted-families/RESULTS.md, 2026-10-03), case c5: a conversation ending on a
// model turn continues on the older ids and is refused with "Requests ending with a model turn are not supported."
// on the newer ones, the same split on the native API, Google's OpenAI-compatible layer and OpenRouter.
test("a Gemini continue by prefill is stated per model, the same on every route", () => {
  for (const [prefix, providerId, wire] of GEMINI_ROUTES) {
    for (const model of ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.5-flash"]) {
      expect(acceptsAssistantPrefill(geminiOn(prefix, providerId, wire, model)), `${providerId} ${model}`).toBe(true);
    }
    for (const model of ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"]) {
      const capability = geminiOn(prefix, providerId, wire, model);
      expect(capability.turns?.assistantPrefill, `${providerId} ${model}`).toBe(false);
      expect(isTurnEstimated(capability, "assistantPrefill"), `${providerId} ${model}`).toBe(false);
    }
  }
  // Only OpenRouter reached these; the direct key got 404 or a quota 429, so the direct routes keep the floor.
  for (const model of ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.1-pro-preview"]) {
    expect(geminiOn("google/", "openrouter", "openai-compat", model).turns?.assistantPrefill, model).toBe(true);
    expect(isTurnEstimated(geminiOn("models/", "custom-openai", "openai-compat", model), "assistantPrefill"), model).toBe(true);
  }
});

test("Google's OpenAI-compatible layer is offered no top_k; the native API keeps it", () => {
  for (const model of ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-3.8-flash"]) {
    expect(geminiOn("models/", "custom-openai", "openai-compat", model).sampling.topK, model).toBeUndefined();
    expect(geminiOn("", "google", "google-generative-ai", model).sampling.topK, model).toEqual({ min: 1, max: 64 });
  }
  expect(Object.keys(geminiOn("models/", "custom-openai", "openai-compat", "gemini-3.5-flash").sampling).toSorted()).toEqual([
    "frequencyPenalty",
    "presencePenalty",
    "seed",
    "stop",
    "temperature",
    "topP",
  ]);
});

test("the compatibility embedding transport does not inherit native multimodal admission", () => {
  const model = "gemini-embedding-2";
  const native = synthesizeCapability("embedding", "google", {
    curated: curatedRows({ model, providerId: testProviderId("google"), wire: "google-generative-ai" }),
  }).capability;
  const compatible = synthesizeCapability("embedding", "google", {
    curated: curatedRows({ model, providerId: testProviderId("custom-openai"), wire: "openai-compat" }),
  }).capability;
  expect(native).toMatchObject({ embedding: { input: ["text", "image", "video", "audio", "file"] } });
  expect(compatible).toMatchObject({ embedding: { input: ["text"], promptScaffold: "gemini-retrieval", dims: 3072 } });
});
