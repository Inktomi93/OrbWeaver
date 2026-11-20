// @subject packages/server/src/domain/connection/verbs/resolve.ts
// The add flow's create and its limits read (`connection.capabilities` with `listFacts`) take the list reach: the server's model list and the reads that
// load no model, never the per-model probe that can load or wake one. What it states about the model's window is then
// the window a later chat turn resolves, so a server that states its window is never asked for it.

import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const BASE_URL = "http://127.0.0.1:11434/v1";
const HTTP_NOT_FOUND = 404;
const OLLAMA_MODEL = "qwen2.5:0.5b";
const PINNED_WINDOW = 8192;
const VLLM_MODEL = "Qwen/Qwen3-8B";
const VLLM_WINDOW = 40_960;
const MODEL_LOADING_PATH = "/api/chat";

type Answers = ReadonlyMap<string, () => Response>;

/** A scripted local server that answers the paths it is given and records every path it is asked for. */
function recordingServer(answers: Answers): { readonly fetch: typeof fetch; readonly requested: readonly string[] } {
  const requested: string[] = [];
  const scripted: typeof fetch = (input, init) => {
    const url = new URL(new Request(input, init).url);
    requested.push(url.pathname);
    const answer = answers.get(url.pathname);
    return Promise.resolve(answer === undefined ? new Response("{}", { status: HTTP_NOT_FOUND }) : answer());
  };
  return { fetch: scripted, requested };
}

const ollamaAnswers: Answers = new Map([
  ["/v1/models", (): Response => Response.json({ data: [{ id: OLLAMA_MODEL }] })],
  // The Modelfile pins the window, which `/api/show` states without loading the model.
  ["/api/show", (): Response => Response.json({ ["model_info"]: {}, parameters: `num_ctx ${String(PINNED_WINDOW)}`, capabilities: ["completion"] })],
  ["/api/ps", (): Response => Response.json({ models: [] })],
  ["/api/version", (): Response => Response.json({ version: "0.12.0" })],
]);

const vllmAnswers: Answers = new Map([
  ["/v1/models", (): Response => Response.json({ data: [{ id: VLLM_MODEL, ["owned_by"]: "vllm", ["max_model_len"]: VLLM_WINDOW }] })],
]);

test("the list read of a just-added local row fetches its list and loads nothing, and the window it states is the one a turn resolves", async () => {
  const server = recordingServer(ollamaAnswers);
  await using root = await createServerHarness({ startJobs: false, providerFetch: server.fetch });
  const caller = await root.internalCallerFor(root.ownerId);
  // The create reads the list itself (the add dialog binds Chat from the tasks it returns), so the window counts both.
  const beforeList = server.requested.length;
  const row = await caller.connection.create({ providerId: "ollama", baseUrl: BASE_URL, credentialId: null, model: OLLAMA_MODEL, label: "Local Ollama" });
  const listed = await caller.connection.capabilities({ connectionId: row.id, listFacts: true });
  const listRequests = server.requested.slice(beforeList);
  expect(listRequests).toEqual(expect.arrayContaining(["/v1/models", "/api/show"]));
  expect(listRequests).not.toContain(MODEL_LOADING_PATH);
  expect(listed.capability).toMatchObject({ kind: "generation", generation: { context: { window: PINNED_WINDOW } } });
  expect(listed.capability.kind === "generation" ? listed.capability.generation.context.windowEstimated : null).toBeUndefined();

  // Positive control: the plain read is the full warm a turn runs, and it does load the model; it agrees on the window.
  const beforeFull = server.requested.length;
  const full = await caller.connection.capabilities({ connectionId: row.id });
  expect(server.requested.slice(beforeFull)).toContain(MODEL_LOADING_PATH);
  expect(full.capability).toMatchObject({ kind: "generation", generation: { context: { window: PINNED_WINDOW } } });
});

test("a server whose model list states the window is not asked for it, and a later turn's read agrees", async () => {
  const server = recordingServer(vllmAnswers);
  await using root = await createServerHarness({ startJobs: false, providerFetch: server.fetch });
  const caller = await root.internalCallerFor(root.ownerId);
  const row = await caller.connection.create({ providerId: "custom-openai", baseUrl: BASE_URL, credentialId: null, model: VLLM_MODEL, label: "Local vLLM" });

  const listed = await caller.connection.capabilities({ connectionId: row.id, listFacts: true });
  expect(listed.capability).toMatchObject({ kind: "generation", generation: { context: { window: VLLM_WINDOW } } });
  expect(listed.capability.kind === "generation" ? listed.capability.generation.context.windowEstimated : null).toBeUndefined();

  const full = await caller.connection.capabilities({ connectionId: row.id });
  expect(full.capability).toMatchObject({ kind: "generation", generation: { context: { window: VLLM_WINDOW } } });
});
