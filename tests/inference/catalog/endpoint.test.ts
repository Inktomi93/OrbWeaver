import { NO_PROVIDER_SECRETS } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { fetchEndpointModels } from "../../../packages/inference/src/catalog/endpoint.ts";
import type { EndpointModel } from "../../../packages/inference/src/contract/runtime.ts";
import { expect, test } from "../../support/fixtures.ts";
import type { LocalServerArm } from "./_local-servers-fetch.ts";
import { localServerFetch } from "./_local-servers-fetch.ts";

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

// ── the native readers over what the rig servers actually answered (scripts/probes/local-servers) ────────

function readArm(
  arm: LocalServerArm,
  modelInfoApi: "ollama" | "llama-cpp" | "koboldcpp",
  overrides?: Readonly<Record<string, unknown>>,
): { readonly rows: Promise<EndpointModel[]>; readonly warnings: string[] } {
  const warnings: string[] = [];
  const rows = fetchEndpointModels({
    fetch: localServerFetch(arm, overrides),
    baseUrl: "http://127.0.0.1:1/v1",
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi,
    warn: (message) => warnings.push(message),
  });
  return { rows, warnings };
}

test("Ollama: each model's capabilities state its kind, modalities and tools; the version states structured output", async () => {
  const { rows, warnings } = readArm("ollama", "ollama");
  await expect(rows).resolves.toEqual([
    // An embedder: its kind and width, nothing a chat model would state.
    { id: "nomic-embed-text:latest", contextLength: 8192, kind: "embedding", embeddingDims: 768, structured: true },
    // A vision model without tools: image input stated, tools absent (the server refuses `tools[]` for it).
    { id: "moondream:latest", contextLength: null, kind: "generation", input: ["text", "image"], structured: true },
    // A tool model without vision: text only, so the posture never offers it an image it would refuse.
    { id: "qwen2.5:0.5b", contextLength: null, kind: "generation", input: ["text"], tools: { parallel: false }, structured: true },
  ]);
  expect(warnings).toEqual([]);
});

test("Ollama: a build without `capabilities` states no kind, modalities or tools, and a version below the floor states no structured output", async () => {
  const { rows } = readArm("ollama", "ollama", {
    "api-version": { version: "0.4.9" },
    "api-show-qwen2.5-0.5b": { model_info: { "qwen2.context_length": 32_768, "qwen2.embedding_length": 896 } },
  });
  const qwen = (await rows).find((row) => row.id === "qwen2.5:0.5b");
  expect(qwen).toEqual({ id: "qwen2.5:0.5b", contextLength: null, embeddingDims: 896, structured: false });
  // No version answer at all: structured stays unstated rather than false.
  const silent = await readArm("ollama", "ollama", { "api-version": undefined }).rows;
  expect(silent.find((row) => row.id === "qwen2.5:0.5b")?.structured).toBeUndefined();
});

test("llama.cpp: `/props` states the loaded modalities and the template's tool support for the one model it serves", async () => {
  await expect(readArm("llamacpp-chat", "llama-cpp").rows).resolves.toEqual([
    { id: "/models/qwen2.5-0.5b-instruct-q4_k_m.gguf", contextLength: 4096, embeddingDims: 896, input: ["text"], tools: { parallel: true }, structured: true },
  ]);
  // A projector loaded, a template that cannot render tools: image input stated, tools absent.
  await expect(readArm("llamacpp-vision", "llama-cpp").rows).resolves.toEqual([
    { id: "/models/SmolVLM-256M-Instruct-Q8_0.gguf", contextLength: 4096, embeddingDims: 576, input: ["text", "image", "video"], structured: true },
  ]);
  // An embedder: its width from the list's `meta`.
  await expect(readArm("llamacpp-embed", "llama-cpp").rows).resolves.toMatchObject([
    { id: "/models/nomic-embed-text-v1.5.Q8_0.gguf", contextLength: 2048, embeddingDims: 768 },
  ]);
});

test("llama.cpp: the router's bare `/props` describes no model, so each row keeps its own modalities and tools stay unstated", async () => {
  await expect(readArm("llamacpp-router", "llama-cpp").rows).resolves.toEqual([
    { id: "qwen2.5-0.5b-instruct-q4_k_m", contextLength: null, input: ["text"], structured: true },
    { id: "smolvlm-256m", contextLength: null, input: ["text", "image"], structured: true },
  ]);
});

test("llama.cpp: a template that describes tools but cannot render a call states no tools; an old build states no structured output; no `/props` states nothing", async () => {
  const partial = await readArm("llamacpp-chat", "llama-cpp", {
    props: {
      modalities: { vision: false, video: false, audio: false },
      chat_template_caps: { supports_tools: true, supports_tool_calls: false },
      build_info: "b2000-abc",
    },
  }).rows;
  expect(partial[0]).toEqual({ id: "/models/qwen2.5-0.5b-instruct-q4_k_m.gguf", contextLength: 4096, embeddingDims: 896, input: ["text"], structured: false });
  const silent = readArm("llamacpp-chat", "llama-cpp", { props: undefined });
  expect(await silent.rows).toEqual([{ id: "/models/qwen2.5-0.5b-instruct-q4_k_m.gguf", contextLength: 4096, embeddingDims: 896 }]);
  expect(silent.warnings).toHaveLength(1);
});

test("KoboldCpp: the version states the projector and structured output; tools stay unstated", async () => {
  await expect(readArm("kobold-chat", "koboldcpp").rows).resolves.toEqual([
    { id: "koboldcpp/qwen2.5-0.5b-instruct-q4_k_m", contextLength: 4096, input: ["text"], structured: true },
  ]);
  await expect(readArm("kobold-vision", "koboldcpp").rows).resolves.toEqual([
    { id: "koboldcpp/SmolVLM-256M-Instruct-Q8_0", contextLength: 4096, input: ["text", "image"], structured: true },
  ]);
  // Below the structured-output floor, and a version string the floor cannot read.
  const old = await readArm("kobold-chat", "koboldcpp", { "api-extra-version": { version: "1.89", vision: false } }).rows;
  expect(old[0]).toEqual({ id: "koboldcpp/qwen2.5-0.5b-instruct-q4_k_m", contextLength: 4096, input: ["text"], structured: false });
  const unreadable = await readArm("kobold-chat", "koboldcpp", { "api-extra-version": { version: "concedo", vision: true } }).rows;
  expect(unreadable[0]).toEqual({ id: "koboldcpp/qwen2.5-0.5b-instruct-q4_k_m", contextLength: 4096, input: ["text", "image"] });
});
