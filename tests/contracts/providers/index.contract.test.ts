import type {
  AccountCredits,
  EmbedResult,
  EndpointInspection,
  GenerationCost,
  ImageEmbedResult,
  RerankResult,
  SummarizeResult,
  VerifyAuthResult,
} from "@orb/contracts/providers";
import {
  accountCreditsSchema,
  embedResultSchema,
  endpointInspectionSchema,
  generationCostSchema,
  imageEmbedResultSchema,
  rerankResultSchema,
  summarizeResultSchema,
  verifyAuthResultSchema,
} from "@orb/contracts/providers";
import { expect, test } from "../../support/fixtures";

// Sample vectors — built (not pasted) so they carry no high-entropy literal (noSecrets).
const vecA = new Float32Array([0.1, 0.2, 0.3]);
const vecB = new Float32Array([-0.4, 0.5, 0.6]);

test("embedResultSchema parses, round-trips, and carries the null filtered-input sentinel", () => {
  const value: EmbedResult = {
    // The `null` slot marks a filtered (empty/whitespace) input — the local family emits it.
    vectors: [vecA, null, vecB],
    model: "qwen3-vl-embedding",
    usage: { promptTokens: 12, totalTokens: 12 },
  };
  const parsed = embedResultSchema.parse(value);
  expect(parsed).toEqual(value);
  // Float32Array survives the parse as the same binary value (instanceof, not coerced).
  expect(parsed.vectors[0]).toBeInstanceOf(Float32Array);
  expect(parsed.vectors[1]).toBeNull();
  // usage halves are nullable for unmetered (in-process) families.
  expect(
    embedResultSchema.parse({ ...value, usage: { promptTokens: null, totalTokens: null } }),
  ).toEqual({
    ...value,
    usage: { promptTokens: null, totalTokens: null },
  });
});

test("embedResultSchema rejects a plain number[] vector (must be Float32Array)", () => {
  const bad = {
    vectors: [[0.1, 0.2, 0.3]],
    model: "m",
    usage: { promptTokens: null, totalTokens: null },
  };
  expect(embedResultSchema.safeParse(bad).success).toBe(false);
  // Missing the model provenance is also invalid.
  expect(
    embedResultSchema.safeParse({ vectors: [vecA], usage: { promptTokens: 1, totalTokens: 1 } })
      .success,
  ).toBe(false);
});

test("rerankResultSchema parses, round-trips, and preserves caller ids (not indices)", () => {
  const value: RerankResult = {
    hits: [
      { id: "doc-7", score: 0.91 },
      { id: "doc-2", score: 0.42 },
    ],
    model: "qwen3-vl-reranker",
    usage: { totalTokens: 30 },
  };
  expect(rerankResultSchema.parse(value)).toEqual(value);
  // The id is a caller-supplied string, not an array position.
  expect(rerankResultSchema.parse(value).hits[0]?.id).toBe("doc-7");
});

test("rerankResultSchema rejects a hit missing its id", () => {
  const bad = { hits: [{ score: 0.5 }], model: "m", usage: { totalTokens: null } };
  expect(rerankResultSchema.safeParse(bad).success).toBe(false);
});

test("imageEmbedResultSchema parses, round-trips, and keeps the filtered-input null", () => {
  const value: ImageEmbedResult = { vectors: [vecA, null], model: "qwen3-vl" };
  const parsed = imageEmbedResultSchema.parse(value);
  expect(parsed).toEqual(value);
  expect(parsed.vectors[0]).toBeInstanceOf(Float32Array);
  expect(parsed.vectors[1]).toBeNull();
});

test("imageEmbedResultSchema rejects a missing model (the cross-space provenance)", () => {
  expect(imageEmbedResultSchema.safeParse({ vectors: [vecA] }).success).toBe(false);
});

test("summarizeResultSchema parses, round-trips, and is index-aligned with cost nullable", () => {
  const value: SummarizeResult = {
    items: [
      { text: "first summary", usage: { tokensIn: 100, tokensOut: 20, costUsd: 0.0003 } },
      // Local family: no metered cost.
      { text: "second summary", usage: { tokensIn: null, tokensOut: null, costUsd: null } },
    ],
    model: "qwen3-summarizer",
  };
  expect(summarizeResultSchema.parse(value)).toEqual(value);
  expect(summarizeResultSchema.parse(value).items).toHaveLength(2);
});

test("summarizeResultSchema rejects an item whose usage omits costUsd", () => {
  const bad = { items: [{ text: "x", usage: { tokensIn: 1, tokensOut: 1 } }], model: "m" };
  expect(summarizeResultSchema.safeParse(bad).success).toBe(false);
});

test("accountCreditsSchema parses + round-trips the balance", () => {
  const value: AccountCredits = { total: 10, used: 3 };
  expect(accountCreditsSchema.parse(value)).toEqual(value);
  // Both halves are required — a missing `used` is invalid.
  expect(accountCreditsSchema.safeParse({ total: 10 }).success).toBe(false);
});

test("generationCostSchema parses, round-trips, and keeps the nullable token counts", () => {
  const value: GenerationCost = { totalCost: 0.012, tokensPrompt: 100, tokensCompletion: 40 };
  expect(generationCostSchema.parse(value)).toEqual(value);
  // Token counts are nullable (a provider that doesn't break them out).
  const nulled: GenerationCost = { totalCost: 0.05, tokensPrompt: null, tokensCompletion: null };
  expect(generationCostSchema.parse(nulled)).toEqual(nulled);
  // totalCost is required + numeric.
  expect(generationCostSchema.safeParse({ tokensPrompt: 1, tokensCompletion: 1 }).success).toBe(
    false,
  );
});

test("endpointInspectionSchema parses a success result + round-trips (no error field)", () => {
  const value: EndpointInspection = {
    ok: true,
    request: { url: "https://x.example/chat/completions", headers: { "x-h": "v" }, body: "{}" },
    response: { status: 200, statusText: "OK", bodyPreview: "{}" },
  };
  expect(endpointInspectionSchema.parse(value)).toEqual(value);
});

test("endpointInspectionSchema parses a transport-failure result (null response + error)", () => {
  const value: EndpointInspection = {
    ok: false,
    request: { url: "https://x.example/chat/completions", headers: {}, body: "{}" },
    response: null,
    error: "ECONNREFUSED",
  };
  const parsed = endpointInspectionSchema.parse(value);
  expect(parsed).toEqual(value);
  expect(parsed.response).toBeNull();
});

test("endpointInspectionSchema rejects a result missing the request envelope", () => {
  expect(endpointInspectionSchema.safeParse({ ok: true, response: null }).success).toBe(false);
});

test("the verify-auth result schema parses the max-pro-sub verify arm + round-trips", () => {
  const value: VerifyAuthResult = {
    source: "max-pro-sub",
    ok: true,
    apiKeySource: "none",
    model: "claude-haiku-4-5-20251001",
    reply: "ok",
    costUsd: 0.0004,
  };
  expect(verifyAuthResultSchema.parse(value)).toEqual(value);
});

test("the verify-auth result schema rejects a non-user-vocab source (the seal: no runner names on the wire)", () => {
  expect(
    verifyAuthResultSchema.safeParse({
      source: "agent-sdk",
      ok: true,
      apiKeySource: "none",
      model: "m",
      reply: "ok",
      costUsd: 0,
    }).success,
  ).toBe(false);
});
