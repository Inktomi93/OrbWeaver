// backends/openrouter rerank — the HOSTED arm over `rerank.rerank` (PD-11 wired). Verifies hits preserve
// the caller's document ids (NOT the OpenRouter index), are sorted descending by score, that empty-text
// documents are filtered before scoring (so the returned index maps into the SENT slice), the text-only
// query path (string + `{text}`), and that an image-only query fail-closes as a typed `invalid`. The SDK
// client is a hand-built fake.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { RerankDocument } from "@orb/contracts/role-clients";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RerankRequest } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { runRerank } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../../../support/fixtures.ts";

const MODEL = "qwen/qwen3-reranker";
const CRED = {
  source: "openrouter",
  apiKey: "sk-or-secret",
  credentialId: null,
} as unknown as ResolvedCredential;

type RerankClient = Parameters<typeof runRerank>[0];

function makeRequest(overrides: Partial<RerankRequest> = {}): RerankRequest {
  const base: RerankRequest = {
    credential: CRED,
    model: castId<ModelId>(MODEL),
    query: "best match?",
    documents: [
      { id: "d1", text: "alpha" },
      { id: "d2", text: "beta" },
      { id: "d3", text: "gamma" },
    ],
  };
  return { ...base, ...overrides };
}

interface Captured {
  body: Record<string, unknown> | undefined;
}

function rerankClient(response: unknown): { client: RerankClient; captured: Captured } {
  const captured: Captured = { body: undefined };
  const client = {
    rerank: {
      rerank: (req: { requestBody: Record<string, unknown> }): Promise<unknown> => {
        captured.body = req.requestBody;
        return Promise.resolve(response);
      },
    },
  } as unknown as RerankClient;
  return { client, captured };
}

function rejectingClient(error: unknown): RerankClient {
  return {
    rerank: { rerank: (): Promise<unknown> => Promise.reject(error) },
  } as unknown as RerankClient;
}

describe("runRerank", () => {
  test("hits preserve caller doc ids (not indices) and are sorted by score descending", async () => {
    // Out-of-order indices + scores: index 2 (d3) is most relevant, index 0 (d1) least.
    const { client, captured } = rerankClient({
      model: MODEL,
      results: [
        { index: 0, relevanceScore: 0.2, document: { text: "alpha" } },
        { index: 2, relevanceScore: 0.9, document: { text: "gamma" } },
        { index: 1, relevanceScore: 0.5, document: { text: "beta" } },
      ],
      usage: { totalTokens: 11 },
    });
    const result = await runRerank(client, makeRequest());
    expect(captured.body?.["query"]).toBe("best match?");
    expect(captured.body?.["documents"]).toEqual(["alpha", "beta", "gamma"]);
    expect(result.hits).toEqual([
      { id: "d3", score: 0.9 },
      { id: "d2", score: 0.5 },
      { id: "d1", score: 0.2 },
    ]);
    expect(result.model).toBe(MODEL);
    expect(result.usage).toEqual({ totalTokens: 11 });
  });

  test("filters empty-text documents so the response index maps into the sent slice", async () => {
    const documents: RerankDocument[] = [
      { id: "keep-a", text: "alpha" },
      { id: "drop-empty", text: "   " },
      { id: "drop-none" },
      { id: "keep-b", text: "beta" },
    ];
    // The fake echoes indices into the SENT slice: 0 → keep-a, 1 → keep-b.
    const { client, captured } = rerankClient({
      model: MODEL,
      results: [
        { index: 1, relevanceScore: 0.8, document: { text: "beta" } },
        { index: 0, relevanceScore: 0.3, document: { text: "alpha" } },
      ],
      usage: { totalTokens: 4 },
    });
    const result = await runRerank(client, makeRequest({ documents }));
    expect(captured.body?.["documents"]).toEqual(["alpha", "beta"]);
    expect(result.hits).toEqual([
      { id: "keep-b", score: 0.8 },
      { id: "keep-a", score: 0.3 },
    ]);
  });

  test("text-only query path: resolves the `.text` side of an object query and carries topN", async () => {
    const { client, captured } = rerankClient({
      model: MODEL,
      results: [{ index: 0, relevanceScore: 0.6, document: { text: "alpha" } }],
      usage: { totalTokens: 2 },
    });
    const result = await runRerank(client, makeRequest({ query: { text: "structured query" }, topN: 1 }));
    expect(captured.body?.["query"]).toBe("structured query");
    expect(captured.body?.["topN"]).toBe(1);
    expect(result.hits).toEqual([{ id: "d1", score: 0.6 }]);
  });

  test("an image-only query fail-closes as a typed invalid ProviderError", async () => {
    const { client } = rerankClient({ model: MODEL, results: [], usage: {} });
    const req = makeRequest({ query: { image: new Uint8Array([1, 2, 3]) } });
    await expect(runRerank(client, req)).rejects.toBeInstanceOf(ProviderError);
    await expect(runRerank(client, req)).rejects.toMatchObject({
      kind: "invalid",
      retryable: false,
    });
  });

  test("fail-closes on a non-JSON (string) body", async () => {
    const { client } = rerankClient("upstream returned text/plain");
    await expect(runRerank(client, makeRequest())).rejects.toMatchObject({ kind: "server" });
  });

  test("a 402 surfaces as a typed billing ProviderError", async () => {
    const client = rejectingClient(Object.assign(new Error("no credit"), { statusCode: 402 }));
    await expect(runRerank(client, makeRequest())).rejects.toMatchObject({
      kind: "billing",
      retryable: false,
    });
  });
});
