// @subject packages/inference/src/catalog/listing.ts
// A local server's list entry carries what its reader states: image input as an input modality, and tool support
// in `supportedParameters`, the seat the picker's chips read. A reader that states neither leaves both empty.
import type { ModelListing } from "@orb/contracts/inference";
import { TOOLS_PARAMETER } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot, RUNTIME_ENDPOINT } from "../roles/runtime.fixtures.ts";

const SERVER_ROOT = new URL(RUNTIME_ENDPOINT).origin;

/** A server answering each path from `answers` (keyed by path, `POST /api/show` keyed by the asked model) and 404 elsewhere. */
function localServer(answers: Readonly<Record<string, unknown>>, shows: Readonly<Record<string, unknown>> = {}): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/show") {
      const asked: unknown = await request.json();
      const model = typeof asked === "object" && asked !== null && "model" in asked ? String(asked.model) : "";
      return Response.json(shows[model] ?? {}, { status: shows[model] === undefined ? 404 : 200 });
    }
    const answer = answers[path];
    return answer === undefined ? new Response("not found", { status: 404 }) : Response.json(answer);
  };
}

async function draftEntries(providerId: string, fetchImpl: typeof fetch): Promise<Extract<ModelListing, { listed: true }>["models"]> {
  await using root = await createRuntimeRoot({ providerFetch: fetchImpl });
  const listing = await root.services.connection.draftCatalogModels({
    principal: await root.principalFor(root.ownerId),
    providerId,
    baseUrl: SERVER_ROOT,
    signal: new AbortController().signal,
  });
  if (!listing.listed) {
    throw new Error(`the ${providerId} list did not answer: ${listing.reason}`);
  }
  return listing.models;
}

function chipFacts(
  models: Awaited<ReturnType<typeof draftEntries>>,
): readonly { readonly id: string; readonly input: readonly string[]; readonly params: readonly string[] }[] {
  return models.map((model) => ({ id: model.id, input: model.inputModalities, params: model.supportedParameters }));
}

const MODELS_PATH = "/v1/models";

test("a llama.cpp server whose template takes tools and whose projector sees images lists both", async () => {
  const props = {
    modalities: { vision: true },
    ["chat_template_caps"]: { ["supports_tools"]: true, ["supports_tool_calls"]: true },
    ["default_generation_settings"]: { ["n_ctx"]: 8192 },
    ["build_info"]: "b5000-abc",
  };
  const models = await draftEntries("llama-cpp", localServer({ [MODELS_PATH]: { data: [{ id: "local/seer" }] }, "/props": props }));
  expect(chipFacts(models)).toEqual([{ id: "local/seer", input: ["text", "image"], params: [TOOLS_PARAMETER] }]);
});

test("a llama.cpp server whose template takes no tools lists text input and no tool support", async () => {
  const props = { modalities: { vision: false }, ["chat_template_caps"]: { ["supports_tools"]: false }, ["build_info"]: "b5000-abc" };
  const models = await draftEntries("llama-cpp", localServer({ [MODELS_PATH]: { data: [{ id: "local/plain" }] }, "/props": props }));
  expect(chipFacts(models)).toEqual([{ id: "local/plain", input: ["text"], params: [] }]);
});

test("a KoboldCpp server states image input and leaves tools unstated", async () => {
  const models = await draftEntries(
    "koboldcpp",
    localServer({
      [MODELS_PATH]: { data: [{ id: "koboldcpp/seer" }] },
      "/api/extra/version": { version: "1.95", vision: true, llm: true },
      "/props": { ["n_ctx"]: 8192 },
    }),
  );
  expect(chipFacts(models)).toEqual([{ id: "koboldcpp/seer", input: ["text", "image"], params: [] }]);
});

test("an Ollama server states each model's own tools and vision", async () => {
  const models = await draftEntries(
    "ollama",
    localServer(
      { [MODELS_PATH]: { data: [{ id: "seer:latest" }, { id: "plain:latest" }] }, "/api/version": { version: "0.16.0" }, "/api/ps": { models: [] } },
      { "seer:latest": { capabilities: ["completion", "tools", "vision"] }, "plain:latest": { capabilities: ["completion"] } },
    ),
  );
  expect(chipFacts(models)).toEqual([
    { id: "seer:latest", input: ["text", "image"], params: [TOOLS_PARAMETER] },
    { id: "plain:latest", input: ["text"], params: [] },
  ]);
});

test("a server with no model-info reader lists bare entries", async () => {
  const models = await draftEntries("vllm", localServer({ [MODELS_PATH]: { data: [{ id: "served/model", ["max_model_len"]: 8192 }] } }));
  expect(chipFacts(models)).toEqual([{ id: "served/model", input: [], params: [] }]);
});
