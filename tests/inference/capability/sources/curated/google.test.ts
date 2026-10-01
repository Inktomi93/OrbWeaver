import { builtinProvider, connectionTasks } from "@orb/contracts/inference";
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
  expect(routed).toMatchObject({ generation: { turns: { assistantPrefill: false } } });
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
