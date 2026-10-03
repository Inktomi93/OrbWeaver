// The facts local servers advertise, parsed from what the rig's servers answered (`_local-servers-transcripts.ts`,
// recorded by scripts/probes/local-servers/record-facts.ts): a llama.cpp model's kind from the embeddings and
// rerank handlers' refusals, an embedder's measured width (never `meta.n_embd`), the trained window, the
// template caps and launch sampler defaults, per-model prefill, KoboldCpp's llm/embeddings flags and extras, and
// which forced tool choices each server honours. Ollama's answers are source-derived (the rig ran no Ollama arm):
// they say so where they are built.

import { NO_PROVIDER_SECRETS } from "../../../packages/inference/src/backends/kit/sanitize.ts";
import { fetchEndpointModels } from "../../../packages/inference/src/catalog/endpoint.ts";
import type { EndpointModel } from "../../../packages/inference/src/contract/runtime.ts";
import { expect, test } from "../../support/fixtures.ts";
import type { TranscriptArm } from "./_local-servers-fetch.ts";
import { localServerFetch, transcriptFetch } from "./_local-servers-fetch.ts";

const BASE_URL = "http://127.0.0.1:1/v1";

function read(arm: TranscriptArm, modelInfoApi: "llama-cpp" | "koboldcpp"): Promise<EndpointModel[]> {
  return fetchEndpointModels({ fetch: transcriptFetch(arm), baseUrl: BASE_URL, secret: null, secrets: NO_PROVIDER_SECRETS, modelInfoApi });
}

async function only(arm: TranscriptArm, modelInfoApi: "llama-cpp" | "koboldcpp"): Promise<EndpointModel> {
  const rows = await read(arm, modelInfoApi);
  expect(rows).toHaveLength(1);
  return rows[0] as EndpointModel;
}

test("llama.cpp: a chat server's model is a generation model with its trained window, and `n_embd` is never an embedding width", async () => {
  const row = await only("llamacpp-chat", "llama-cpp");
  expect(row).toMatchObject({
    kind: "generation",
    contextLength: 4096,
    contextTrained: 32_768,
    prefill: "deliver",
    toolChoice: { required: true, named: false },
  });
  // `meta.n_embd` is 896 on this chat model: the hidden size, not a vector width.
  expect(row.embeddingDims).toBeUndefined();
  expect(Object.keys(row.templateCaps ?? {}).sort()).toEqual([
    "supports_object_arguments",
    "supports_parallel_tool_calls",
    "supports_preserve_reasoning",
    "supports_reasoning_effort",
    "supports_string_content",
    "supports_system_role",
    "supports_tool_calls",
    "supports_tools",
    "supports_typed_content",
  ]);
  // The launch defaults, in llama.cpp's own spelling; a nested block (`lora` objects) is not a knob default.
  expect(row.serverDefaults).toMatchObject({ ["top_k"]: 40, ["repeat_penalty"]: 1, samplers: expect.arrayContaining(["top_k", "temperature"]) as unknown });
  expect(row.serverDefaults?.["temperature"]).toBeCloseTo(0.8);
});

test("llama.cpp: an embedder is told apart by its handlers and measured from a returned vector; a reranker and an unpooled server too", async () => {
  await expect(only("llamacpp-embed", "llama-cpp")).resolves.toMatchObject({ kind: "embedding", embeddingDims: 768, contextTrained: 2048 });
  const reranker = await only("llamacpp-rerank", "llama-cpp");
  expect(reranker.kind).toBe("rerank");
  expect(reranker.embeddingDims).toBeUndefined();
  // `--pooling none`: embeddings only on the native per-token route, so nothing is stated.
  const unpooled = await only("llamacpp-embed-nopool", "llama-cpp");
  expect(unpooled.kind).toBeUndefined();
  expect(unpooled.embeddingDims).toBeUndefined();
});

test("llama.cpp: prefill is what the server renders: continued by default, a new turn under --no-prefill-assistant", async () => {
  await expect(only("llamacpp-noprefill", "llama-cpp")).resolves.toMatchObject({ kind: "generation", prefill: "none" });
  // The owner's Qwen3.8-27B under its served template: continued, trained at 262144.
  await expect(only("llamacpp-27b", "llama-cpp")).resolves.toMatchObject({ kind: "generation", prefill: "deliver", contextTrained: 262_144 });
});

test("KoboldCpp: the llm and embeddings flags state the row's kind, and the server's template, reply length and jinja flag ride along", async () => {
  const chat = await only("kobold-chat", "koboldcpp");
  expect(chat).toMatchObject({ kind: "generation", prefill: "deliver", defaultReplyTokens: 1024, jinja: true, toolChoice: { required: false, named: false } });
  expect(chat.chatTemplate).toContain("<|im_start|>");
  // No text model, only `--embeddingsmodel`: the one listed row ("inactive") is the embedder, measured.
  const embedder = await only("kobold-embed", "koboldcpp");
  expect(embedder).toMatchObject({ id: "inactive", kind: "embedding", embeddingDims: 768 });
  expect(embedder.prefill).toBeUndefined();
  await expect(only("kobold-27b", "koboldcpp")).resolves.toMatchObject({ id: "koboldcpp/Qwen3.8-27B-UD-Q4_K_M", kind: "generation", prefill: "deliver" });
});

// SOURCE-DERIVED: Ollama's `/api/chat` with `_debug_render_only` answers a `ChatResponse` whose `_debug_info`
// carries the rendered template (ollama server/routes.go 2911-2922 at 42e911bc); no live Ollama ran here.
function ollamaRender(renderedTemplate: string): Record<string, unknown> {
  return {
    model: "qwen2.5:0.5b",
    ["created_at"]: "2026-10-03T00:00:00Z",
    message: { role: "", content: "" },
    done: false,
    ["_debug_info"]: { ["rendered_template"]: renderedTemplate, ["image_count"]: 0 },
  };
}

test("Ollama: the Modelfile parameters are the server defaults, the render-only reply states prefill, and no forced choice reaches the model", async () => {
  const continued = ollamaRender("<|im_start|>user\nhi<|im_end|>\n<|im_start|>assistant\nPREFILLMARK");
  const rows = await fetchEndpointModels({
    fetch: localServerFetch("ollama", { "api-chat": continued }),
    baseUrl: BASE_URL,
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: "ollama",
  });
  expect(rows.find((row) => row.id === "qwen2.5:0.5b")).toMatchObject({ prefill: "deliver", toolChoice: { required: false, named: false } });
  // moondream's Modelfile (as the rig's Ollama printed it): numbers as numbers, the repeated `stop` as a list.
  expect(rows.find((row) => row.id === "moondream:latest")?.serverDefaults).toEqual({ temperature: 0, stop: ["<|endoftext|>", "Question:"] });
  // An embedder is not asked to render a chat.
  expect(rows.find((row) => row.id === "nomic-embed-text:latest")).toMatchObject({ serverDefaults: { ["num_ctx"]: 8192 } });
  expect(rows.find((row) => row.id === "nomic-embed-text:latest")?.prefill).toBeUndefined();

  const closed = ollamaRender("<|im_start|>user\nhi<|im_end|>\n<|im_start|>assistant\nPREFILLMARK<|im_end|>\n<|im_start|>assistant\n");
  const closedRows = await fetchEndpointModels({
    fetch: localServerFetch("ollama", { "api-chat": closed }),
    baseUrl: BASE_URL,
    secret: null,
    secrets: NO_PROVIDER_SECRETS,
    modelInfoApi: "ollama",
  });
  expect(closedRows.find((row) => row.id === "qwen2.5:0.5b")?.prefill).toBe("none");
});
