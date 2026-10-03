import { NO_PROVIDER_SECRETS } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { fetchEndpointModels } from "../../../packages/inference/src/catalog/endpoint.ts";
import { expect, test } from "../../support/fixtures.ts";

test("endpoint catalog fetch normalizes model ids and the supported context-window spellings", async () => {
  const requests: Array<{ readonly input: string; readonly init: RequestInit | undefined }> = [];
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({ input: String(input), init });
    return Promise.resolve(
      Response.json({
        data: [
          { id: "max-model", max_model_len: 131_072, context_length: 1, max_context_length: 2 },
          { id: "context", context_length: 32_768 },
          { id: "max-context", max_context_length: 8192 },
          { id: "unknown", max_model_len: null },
        ],
      }),
    );
  };

  await expect(
    fetchEndpointModels({
      fetch: fetchImpl as typeof fetch,
      baseUrl: "https://models.example/v1/",
      secret: "token",
      headers: { "x-tenant": "owner" },
      secrets: NO_PROVIDER_SECRETS,
    }),
  ).resolves.toEqual([
    { id: "max-model", contextLength: 131_072 },
    { id: "context", contextLength: 32_768 },
    { id: "max-context", contextLength: 8192 },
    { id: "unknown", contextLength: null },
  ]);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.input).toBe("https://models.example/v1/models");
  expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer token");
  expect(new Headers(requests[0]?.init?.headers).get("x-tenant")).toBe("owner");
});

/** An Ollama box: `/v1/models` lists ids only; the native API answers per model. */
function ollamaFetch(shows: Readonly<Record<string, unknown>>, loaded: readonly unknown[], seen: string[]): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith("/v1/models")) {
      return Promise.resolve(Response.json({ data: Object.keys(shows).map((id) => ({ id })) }));
    }
    if (url.endsWith("/api/ps")) {
      return Promise.resolve(Response.json({ models: loaded }));
    }
    const model = (JSON.parse(String(init?.body)) as { model: string }).model;
    const show = shows[model];
    return Promise.resolve(show === undefined ? Response.json({ error: "not found" }, { status: 404 }) : Response.json(show));
  }) as typeof fetch;
}

// The window Ollama runs is `num_ctx` (Modelfile) or the loaded runner's; the trained maximum in `model_info` is
// a ceiling it does NOT truncate at, so it must never be reported as the window.
test("an Ollama row reads the window Ollama truncates at and an embedder's width, never the trained maximum", async () => {
  const seen: string[] = [];
  const rows = await fetchEndpointModels({
    fetch: ollamaFetch(
      {
        "pinned:8b": { parameters: "num_ctx                        16384", ["model_info"]: { ["llama.context_length"]: 131_072 } },
        "loaded:8b": { parameters: 'stop "<|eot_id|>"', ["model_info"]: { ["llama.context_length"]: 131_072 } },
        "cold:8b": { ["model_info"]: { ["llama.context_length"]: 131_072 } },
        "nomic-embed-text:latest": { ["model_info"]: { ["nomic-bert.embedding_length"]: 768 } },
      },
      [{ name: "loaded:8b", model: "loaded:8b", ["context_length"]: 4096 }],
      seen,
    ),
    baseUrl: "http://127.0.0.1:11434/v1",
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: "ollama",
  });
  expect(rows).toEqual([
    { id: "pinned:8b", contextLength: 16_384 },
    { id: "loaded:8b", contextLength: 4096 },
    { id: "cold:8b", contextLength: null },
    { id: "nomic-embed-text:latest", contextLength: null, embeddingDims: 768 },
  ]);
  expect(seen).toContain("http://127.0.0.1:11434/api/ps");
  expect(seen).toContain("http://127.0.0.1:11434/api/show");
});

test("a server that does not answer the native API still lists its models, and says why it has no window", async () => {
  const warnings: string[] = [];
  const fetchImpl = ((input: string | URL | Request): Promise<Response> =>
    Promise.resolve(
      String(input).endsWith("/v1/models") ? Response.json({ data: [{ id: "llama3.1:8b" }] }) : Response.json({ error: "no route" }, { status: 404 }),
    )) as typeof fetch;
  const rows = await fetchEndpointModels({
    fetch: fetchImpl,
    baseUrl: "http://127.0.0.1:11434",
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: "ollama",
    warn: (message) => warnings.push(message),
  });
  expect(rows).toEqual([{ id: "llama3.1:8b", contextLength: null }]);
  expect(warnings.length).toBeGreaterThan(0);
});

test("endpoint catalog fetch rejects a malformed catalog instead of inventing rows", async () => {
  const fetchImpl = (): Promise<Response> => Promise.resolve(Response.json({ data: [{ id: 42 }] }));

  await expect(
    fetchEndpointModels({
      fetch: fetchImpl as typeof fetch,
      baseUrl: "https://models.example",
      secret: null,
      secrets: NO_PROVIDER_SECRETS,
    }),
  ).rejects.toThrow();
});
