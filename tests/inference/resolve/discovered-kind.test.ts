// What a local server says about a model reaches every reader: the model's kind is discovered before the resolver and
// the capability reader choose a task from it, and each model on a shared server gets its own per-model probe.

import { createInferenceRuntime } from "@orb/inference";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newUserId } from "../_support.ts";

const OLLAMA_URL = "http://ollama.test:11434";

/** An Ollama server listing `models`, each with the `/api/show` capabilities given. Records the model each
 *  `/api/chat` render probe asked about. */
function ollamaServer(models: Readonly<Record<string, readonly string[]>>): { readonly fetch: typeof fetch; readonly rendered: string[] } {
  const rendered: string[] = [];
  const routes: Readonly<Record<string, (model: string) => unknown>> = {
    "/v1/models": () => ({ object: "list", data: Object.keys(models).map((id) => ({ id, object: "model" })) }),
    "/api/version": () => ({ version: "0.12.0" }),
    "/api/ps": () => ({ models: [] }),
    "/api/show": (model) => ({ capabilities: models[model] ?? [], ["model_info"]: { "general.architecture": "test", "test.embedding_length": 768 } }),
    "/api/chat": (model) => {
      rendered.push(model);
      return { ["_debug_info"]: { ["rendered_template"]: "<user>hi</user><assistant>PREFILLMARK" } };
    },
  };
  const fetchImpl: typeof fetch = (input, init) => {
    const route = routes[new URL(input instanceof Request ? input.url : String(input)).pathname];
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { readonly model?: string }) : {};
    return Promise.resolve(route === undefined ? new Response("not found", { status: 404 }) : Response.json(route(body.model ?? "")));
  };
  return { fetch: fetchImpl, rendered };
}

test("an uncurated Ollama embedder reads as an embedder on the first capability read and every one after", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "ollama", model: "house-embedder:latest", baseUrl: OLLAMA_URL });
  stores.connections.rows.set(row.id, row);
  const server = ollamaServer({ "house-embedder:latest": ["embedding"] });
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: server.fetch }));

  for (let read = 0; read < 2; read += 1) {
    const facts = await runtime.capabilities.for({ connectionId: row.id, principal: principal(ownerId) });
    expect(facts.capability.kind).toBe("embedding");
    expect(facts.tasks).toContain("embed");
    expect(facts.tasks).not.toContain("chat");
  }
});

test("two models on one Ollama server each get their own render probe, so the second does not run on guessed facts", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const first = fakeConnection({ ownerId, providerId: "ollama", model: "alpha:7b", baseUrl: OLLAMA_URL });
  const second = fakeConnection({ ownerId, providerId: "ollama", model: "beta:7b", baseUrl: OLLAMA_URL });
  stores.connections.rows.set(first.id, first);
  stores.connections.rows.set(second.id, second);
  const server = ollamaServer({ "alpha:7b": ["completion"], "beta:7b": ["completion"] });
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: server.fetch }));
  const asker = principal(ownerId);

  await runtime.resolve({ task: "chat", principal: asker, connectionId: first.id });
  const { resolved } = await runtime.resolve({ task: "chat", principal: asker, connectionId: second.id });

  expect(server.rendered.toSorted((a, b) => a.localeCompare(b))).toEqual(["alpha:7b", "beta:7b"]);
  expect(resolved.capability.kind === "generation" && resolved.capability.generation.turns?.assistantPrefill).toBe(true);
  // A third resolve of a probed model asks nothing again.
  await runtime.resolve({ task: "chat", principal: asker, connectionId: first.id });
  expect(server.rendered).toHaveLength(2);
});
