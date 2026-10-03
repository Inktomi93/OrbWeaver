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
function ollamaFetch(
  box: { readonly version: string; readonly shows: Readonly<Record<string, unknown>>; readonly loaded: readonly unknown[] },
  seen: string[],
): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    seen.push(url);
    if (url.endsWith("/v1/models")) {
      return Promise.resolve(Response.json({ data: Object.keys(box.shows).map((id) => ({ id })) }));
    }
    if (url.endsWith("/api/version")) {
      return Promise.resolve(Response.json({ version: box.version }));
    }
    if (url.endsWith("/api/ps")) {
      return Promise.resolve(Response.json({ models: box.loaded }));
    }
    const model = (JSON.parse(String(init?.body)) as { model: string }).model;
    const show = box.shows[model];
    return Promise.resolve(show === undefined ? Response.json({ error: "not found" }, { status: 404 }) : Response.json(show));
  }) as typeof fetch;
}

function readOllama(box: Parameters<typeof ollamaFetch>[0], seen: string[] = []): Promise<EndpointModel[]> {
  return fetchEndpointModels({
    fetch: ollamaFetch(box, seen),
    baseUrl: "http://127.0.0.1:11434/v1",
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: "ollama",
  });
}

const TRAINED_MAX = { ["model_info"]: { ["llama.context_length"]: 131_072 } };

// `/v1/chat/completions` runs the Modelfile's `num_ctx`, else the server default, and keeps only the tail of a
// longer prompt. The trained maximum is a ceiling it does NOT run at, and a loaded runner's window is whatever
// the client that loaded it asked for: the next `/v1` request reloads at the default.
test("an Ollama row states only a pinned window, and assumes the default floor for the rest, never a loaded runner's or the trained maximum", async () => {
  const seen: string[] = [];
  const rows = await readOllama(
    {
      version: "0.35.1",
      shows: {
        "pinned:8b": { parameters: "num_ctx                        16384", ...TRAINED_MAX },
        "loaded-wide:8b": { parameters: 'stop "<|eot_id|>"', ...TRAINED_MAX },
        "loaded-narrow:8b": TRAINED_MAX,
        "cold:8b": TRAINED_MAX,
        "nomic-embed-text:latest": { ["model_info"]: { ["nomic-bert.embedding_length"]: 768 } },
      },
      loaded: [
        { name: "loaded-wide:8b", model: "loaded-wide:8b", ["context_length"]: 32_768 },
        { name: "loaded-narrow:8b", model: "loaded-narrow:8b", ["context_length"]: 2048 },
      ],
    },
    seen,
  );
  expect(rows).toEqual([
    { id: "pinned:8b", contextLength: 16_384, contextTrained: 131_072, structured: true },
    { id: "loaded-wide:8b", contextLength: null, contextFloor: 4096, contextTrained: 131_072, structured: true },
    { id: "loaded-narrow:8b", contextLength: null, contextFloor: 2048, contextTrained: 131_072, structured: true },
    { id: "cold:8b", contextLength: null, contextFloor: 4096, contextTrained: 131_072, structured: true },
    { id: "nomic-embed-text:latest", contextLength: null, contextFloor: 4096, embeddingDims: 768, structured: true },
  ]);
  expect(seen).toContain("http://127.0.0.1:11434/api/ps");
  expect(seen).toContain("http://127.0.0.1:11434/api/show");
});

// Ollama clamps `num_ctx` to the trained maximum when it loads the runner, so the stated window never exceeds it.
test("an Ollama window, pinned or assumed, is clamped to a trained maximum below it", async () => {
  const trained = (context: number): Record<string, unknown> => ({ ["model_info"]: { ["llama.context_length"]: context } });
  const rows = await readOllama({
    version: "0.35.1",
    shows: {
      "pinned-past-trained:8b": { parameters: "num_ctx                        32768", ...trained(8192) },
      "floor-past-trained:1b": trained(2048),
      "pinned-within-trained:8b": { parameters: "num_ctx                        16384", ...trained(131_072) },
    },
    loaded: [],
  });
  expect(rows).toEqual([
    { id: "pinned-past-trained:8b", contextLength: 8192, contextTrained: 8192, structured: true },
    { id: "floor-past-trained:1b", contextLength: null, contextFloor: 2048, contextTrained: 2048, structured: true },
    { id: "pinned-within-trained:8b", contextLength: 16_384, contextTrained: 131_072, structured: true },
  ]);
});

// A multimodal model's `model_info` carries a `*.context_length` per component (the vision tower beside the text
// model), in no promised order. The key under `general.architecture` is the model's own.
test("the trained window is the model's own architecture key, not whichever *.context_length comes first", async () => {
  const rows = await readOllama({
    version: "0.35.1",
    shows: {
      "vision:8b": {
        ["model_info"]: { ["clip.context_length"]: 77, ["general.architecture"]: "gemma3", ["gemma3.context_length"]: 131_072 },
      },
      "no-arch:8b": { ["model_info"]: { ["llama.context_length"]: 8192 } },
    },
    loaded: [],
  });
  expect(rows.map((row) => [row.id, row.contextTrained])).toEqual([
    ["vision:8b", 131_072],
    ["no-arch:8b", 8192],
  ]);
});

test("the Ollama default floor is 4096 from the VRAM-tier release on and 2048 before it", async () => {
  const floorAt = async (version: string): Promise<number | undefined> =>
    (await readOllama({ version, shows: { "cold:8b": TRAINED_MAX }, loaded: [] }))[0]?.contextFloor;
  expect(await floorAt("0.15.5")).toBe(4096);
  expect(await floorAt("0.15.4")).toBe(2048);
  expect(await floorAt("0.4.9")).toBe(2048);
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
  // No version answer: the lowest default any release shipped stays the assumed window.
  expect(rows).toEqual([{ id: "llama3.1:8b", contextLength: null, contextFloor: 2048 }]);
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
    // An embedder: its kind and width, nothing a chat model would state. Its Modelfile pins 8192, but the GGUF
    // was trained at 2048 (`nomic-bert.context_length`), and Ollama clamps the pin to that at load.
    { id: "nomic-embed-text:latest", contextLength: 2048, contextTrained: 2048, kind: "embedding", embeddingDims: 768, structured: true },
    // A vision model without tools: image input stated, tools absent (the server refuses `tools[]` for it). Its
    // trained 2048 (`phi2.context_length`) clamps the 4096 default floor.
    { id: "moondream:latest", contextLength: null, contextFloor: 2048, contextTrained: 2048, kind: "generation", input: ["text", "image"], structured: true },
    // A tool model without vision: text only, so the posture never offers it an image it would refuse.
    {
      id: "qwen2.5:0.5b",
      contextLength: null,
      contextFloor: 4096,
      contextTrained: 32_768,
      kind: "generation",
      input: ["text"],
      tools: { parallel: false },
      structured: true,
    },
  ]);
  expect(warnings).toEqual([]);
});

test("Ollama: a build without `capabilities` states no kind, modalities or tools, and a version below the floor states no structured output", async () => {
  const { rows } = readArm("ollama", "ollama", {
    "api-version": { version: "0.4.9" },
    "api-show-qwen2.5-0.5b": { model_info: { "qwen2.context_length": 32_768, "qwen2.embedding_length": 896 } },
  });
  const qwen = (await rows).find((row) => row.id === "qwen2.5:0.5b");
  expect(qwen).toEqual({ id: "qwen2.5:0.5b", contextLength: null, contextFloor: 2048, contextTrained: 32_768, embeddingDims: 896, structured: false });
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
