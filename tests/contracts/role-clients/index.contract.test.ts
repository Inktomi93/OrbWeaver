import type { EmbedResult, ImageEmbedResult, RerankResult, SummarizeResult } from "@orb/contracts/providers";
import { embedResultSchema, imageEmbedResultSchema, rerankResultSchema, summarizeResultSchema } from "@orb/contracts/providers";
import type { ImageEmbedInput, RerankDocument, RerankQuery, RoleClients, SummarizeInput } from "@orb/contracts/role-clients";
import { expect, test } from "../../support/fixtures";

// Sample vectors — built (not pasted) so they carry no high-entropy literal (noSecrets).
const vecA = new Float32Array([0.1, 0.2, 0.3]);
const vecB = new Float32Array([-0.4, 0.5, 0.6]);

// Grounded result fixtures — each is a value of the RESULT type imported from `@orb/contracts/providers`.
// A no-op `RoleClients` resolves to these, proving the bundle's return types ARE the providers shapes.
const sampleEmbedResult: EmbedResult = {
  vectors: [vecA, vecB],
  model: "qwen3-vl-embedding",
  usage: { promptTokens: 8, totalTokens: 8 },
};
const sampleRerankResult: RerankResult = {
  hits: [{ id: "doc-1", score: 0.9 }],
  model: "qwen3-vl-reranker",
  usage: { totalTokens: null },
};
const sampleImageEmbedResult: ImageEmbedResult = {
  vectors: [vecA],
  model: "qwen3-vl-embedding",
};
const sampleSummarizeResult: SummarizeResult = {
  items: [{ text: "a summary", usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
  model: "qwen3-summarizer",
};

// THE STRUCTURAL ASSERTION: a no-op object satisfies `RoleClients` (it compiles). Callables are
// pre-bound thunks — no credential/model argument anywhere, which keeps role-clients at Layer 1.
// Param-less arrows are assignable to the typed properties (and avoid noUnusedFunctionParameters).
const noopRoleClients: RoleClients = {
  embed: (): Promise<EmbedResult> => Promise.resolve(sampleEmbedResult),
  rerank: (): Promise<RerankResult> => Promise.resolve(sampleRerankResult),
  imageEmbed: (): Promise<ImageEmbedResult> => Promise.resolve(sampleImageEmbedResult),
  summarize: (): Promise<SummarizeResult> => Promise.resolve(sampleSummarizeResult),
  embedModel: "qwen3-vl-embedding",
  rerankModel: "qwen3-vl-reranker",
  imageEmbedModel: "qwen3-vl-embedding",
  summarizerModel: "qwen3-summarizer",
  summarizerContextTokens: 32_000,
};

test("a no-op object satisfies RoleClients: four derive callables + four model-provenance strings", () => {
  expect(Object.keys(noopRoleClients).sort()).toEqual(
    ["embed", "embedModel", "imageEmbed", "imageEmbedModel", "rerank", "rerankModel", "summarize", "summarizerContextTokens", "summarizerModel"].sort(),
  );
  // FLAG pin: the bundle has NO chat/agent/generateImage member (not groundable at L1 — no such
  // result contract in @orb/contracts/providers). If one is added later this assertion changes.
  expect("chat" in noopRoleClients).toBe(false);
  expect("agent" in noopRoleClients).toBe(false);
  expect("generateImage" in noopRoleClients).toBe(false);
  // The *Model provenance fields are plain strings.
  expect(typeof noopRoleClients.embedModel).toBe("string");
  expect(typeof noopRoleClients.summarizerModel).toBe("string");
});

test("each callable's result is the matching @orb/contracts/providers shape (parses + round-trips)", async () => {
  // `embed(input, opts)` — string or string[], with the query/document retrieval hint.
  const embedQuery = "a search query";
  const embedDocs = ["doc one", "doc two"];
  expect(embedResultSchema.parse(await noopRoleClients.embed(embedQuery))).toEqual(sampleEmbedResult);
  expect(embedResultSchema.parse(await noopRoleClients.embed(embedDocs, { inputType: "document" }))).toEqual(sampleEmbedResult);

  // `rerank(query, documents, opts)` — RerankQuery union (string | {text?,image?}); caller-id docs.
  const stringQuery: RerankQuery = "find the matching card";
  const multimodalQuery: RerankQuery = { text: "a portrait", image: new Uint8Array([1, 2, 3]) };
  const docs: RerankDocument[] = [
    { id: "card-1", text: "a brave knight" },
    { id: "card-2", image: "art/card-2.png" },
  ];
  expect(rerankResultSchema.parse(await noopRoleClients.rerank(stringQuery, docs))).toEqual(sampleRerankResult);
  expect(rerankResultSchema.parse(await noopRoleClients.rerank(multimodalQuery, docs, { instruction: "retrieve the match" }))).toEqual(sampleRerankResult);

  // `imageEmbed(req)` — the discriminated ImageEmbedInput (credential/model/signal-free).
  const imageReq: ImageEmbedInput = { kind: "image", input: new Uint8Array([4, 5, 6]) };
  const textReq: ImageEmbedInput = { kind: "text", input: ["a caption"], instruction: "retrieve" };
  const pairReq: ImageEmbedInput = {
    kind: "multimodal",
    input: { image: "art/card.png", text: "the caption" },
  };
  const imageEmbedResults = await Promise.all([imageReq, textReq, pairReq].map((req) => noopRoleClients.imageEmbed(req)));
  for (const result of imageEmbedResults) {
    expect(imageEmbedResultSchema.parse(result)).toEqual(sampleImageEmbedResult);
  }

  // `summarize(inputs, opts)` — batch of (system, user) pairs + per-call sampling overrides.
  const inputs: SummarizeInput[] = [
    { systemPrompt: "distill", userPrompt: "a long passage" },
    { systemPrompt: "distill", userPrompt: "another", images: [new Uint8Array([7])] },
  ];
  expect(
    summarizeResultSchema.parse(
      await noopRoleClients.summarize(inputs, {
        maxTokens: 256,
        temperature: 0.3,
        repetitionDetection: { maxPatternSize: 4, minCount: 2 },
      }),
    ),
  ).toEqual(sampleSummarizeResult);
});
