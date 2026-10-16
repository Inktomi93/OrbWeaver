// @subject tests/support/node/corpus-provider.ts
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_BODY_LIMIT_BYTES,
  createCorpusProviderExecution,
  createCorpusProviderServer,
} from "./corpus-provider.ts";
import { expect, test } from "./fixtures.ts";

test("native corpus provider serves the existing script and retires its socket", async () => {
  await using provider = await createCorpusProviderServer(async (baseUrl) =>
    createCorpusProviderExecution({
      baseUrl,
      modelIds: [CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "",
      structuredReplies: new Map(),
      images: [],
    }),
  );
  const endpoint = `${provider.baseUrl}/embeddings`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ model: CORPUS_EMBED_MODEL, input: ["native corpus witness", "second witness"] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      model: CORPUS_EMBED_MODEL,
      data: [
        { index: 0, embedding: [...CORPUS_EMBEDDING_VECTOR] },
        { index: 1, embedding: [...CORPUS_EMBEDDING_VECTOR] },
      ],
    });
    const rejected = await fetch(endpoint, { method: "POST", body: "private-malformed-input" });
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).not.toContain("private-malformed-input");
    const unknown = await fetch(`${provider.baseUrl}/unscripted`, { method: "POST", body: JSON.stringify({ model: CORPUS_EMBED_MODEL }) });
    expect(unknown.status).toBe(400);
    await unknown.text();
    const oversized = await fetch(endpoint, { method: "POST", body: "x".repeat(CORPUS_PROVIDER_BODY_LIMIT_BYTES + 1) });
    expect(oversized.status).toBe(413);
    await oversized.text();
    expect(provider.requests).toEqual(["POST /v1/embeddings", "POST /v1/embeddings", "POST /v1/unscripted"]);
  } finally {
    await provider[Symbol.asyncDispose]();
  }
  await expect(fetch(endpoint, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
  await provider[Symbol.asyncDispose]();
});

test("native corpus provider releases its listener when script construction fails", async () => {
  let endpoint = "";
  await expect(
    createCorpusProviderServer((baseUrl) => {
      endpoint = baseUrl;
      return Promise.reject(new Error("script unavailable"));
    }),
  ).rejects.toThrow("script unavailable");
  await expect(fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
});
