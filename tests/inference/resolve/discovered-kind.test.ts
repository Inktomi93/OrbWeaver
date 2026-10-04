// What a local server says about a model reaches every reader: the model's kind is discovered before the resolver and
// the capability reader choose a task from it, and each model on a shared server gets its own per-model probe.

import { createInferenceRuntime } from "@orb/inference";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, newUserId } from "../_support.ts";

const OLLAMA_URL = "http://ollama.test:11434";

/** An Ollama server listing `models`, each with the `/api/show` capabilities given. Records the model each
 *  `/api/chat` render probe asked about; `holdRender` keeps a render unanswered until the promise it returns settles. */
function ollamaServer(
  models: Record<string, readonly string[]>,
  holdRender?: (model: string) => Promise<void> | undefined,
): { readonly fetch: typeof fetch; readonly rendered: string[]; readonly shown: string[] } {
  const rendered: string[] = [];
  const shown: string[] = [];
  const routes: Readonly<Record<string, (model: string) => unknown>> = {
    "/v1/models": () => ({ object: "list", data: Object.keys(models).map((id) => ({ id, object: "model" })) }),
    "/api/version": () => ({ version: "0.12.0" }),
    "/api/ps": () => ({ models: [] }),
    "/api/show": (model) => ({ capabilities: models[model] ?? [], ["model_info"]: { "general.architecture": "test", "test.embedding_length": 768 } }),
    "/api/chat": () => ({ ["_debug_info"]: { ["rendered_template"]: "<user>hi</user><assistant>PREFILLMARK" } }),
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const route = routes[path];
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { readonly model?: string }) : {};
    const model = body.model ?? "";
    if (path === "/api/show") {
      shown.push(model);
    }
    if (path === "/api/chat") {
      rendered.push(model);
      await holdRender?.(model);
    }
    return route === undefined ? new Response("not found", { status: 404 }) : Response.json(route(model));
  };
  return { fetch: fetchImpl, rendered, shown };
}

// Ollama serves `alpha` as `alpha:latest`, and its list names the tag; the row typed without it is the same model.
test("a model named without its implicit :latest tag still gets its own probe", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "ollama", model: "alpha", baseUrl: OLLAMA_URL });
  stores.connections.rows.set(row.id, row);
  const server = ollamaServer({ "alpha:latest": ["completion"] });
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: server.fetch }));

  const { resolved } = await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id });

  expect(server.rendered).toEqual(["alpha:latest"]);
  expect(resolved.capability.kind === "generation" && resolved.capability.generation.turns?.assistantPrefill).toBe(true);
});

// A probe still running when the server's facts are refreshed answers for the list it started on, never the new one.
test("a model probe that outlives a refresh of the server's facts does not overwrite the refreshed row", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const alpha = fakeConnection({ ownerId, providerId: "ollama", model: "alpha:7b", baseUrl: OLLAMA_URL });
  const beta = fakeConnection({ ownerId, providerId: "ollama", model: "beta:7b", baseUrl: OLLAMA_URL });
  stores.connections.rows.set(alpha.id, alpha);
  stores.connections.rows.set(beta.id, beta);
  const models: Record<string, readonly string[]> = { "alpha:7b": ["completion"], "beta:7b": ["completion"] };
  const { promise: released, resolve: release } = Promise.withResolvers<undefined>();
  const server = ollamaServer(models, (model) => (model === "beta:7b" ? released : undefined));
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: server.fetch }));
  const asker = principal(ownerId);
  await runtime.resolve({ task: "chat", principal: asker, connectionId: alpha.id });

  // beta's render probe starts on the list alpha warmed, and stalls.
  const stale = runtime.resolve({ task: "chat", principal: asker, connectionId: beta.id }).catch(() => undefined);
  await expect.poll(() => server.rendered).toContain("beta:7b");
  // The server now serves beta as an embedder, and its facts are refreshed.
  models["beta:7b"] = ["embedding"];
  await runtime.catalogs.invalidateEndpoint(beta);
  const fresh = runtime.modelKind(beta);
  // The stalled probe answers only once the refreshed list is read and held.
  await expect.poll(() => server.shown.filter((model) => model === "beta:7b")).toHaveLength(2);
  await new Promise((settled) => setTimeout(settled, 50));
  release(undefined);
  await Promise.all([stale, fresh]);

  expect(await runtime.modelKind(beta, { cachedFacts: true })).toBe("embedding");
});

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

// `/api/show` is the only Ollama read that says what a model is. A slow one leaves the kind unknown, and an unknown
// kind is no answer: the next warm asks again rather than reading the model as a chat model from then on.
test("a model whose /api/show answered too late is asked again, not cached as a model of no kind", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "ollama", model: "house-embedder:latest", baseUrl: OLLAMA_URL });
  stores.connections.rows.set(row.id, row);
  const server = ollamaServer({ "house-embedder:latest": ["embedding"] });
  const show: { stalls: boolean } = { stalls: true };
  const stalling: typeof fetch = (input, init) => {
    if (show.stalls && new URL(String(input)).pathname === "/api/show") {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    return server.fetch(input, init);
  };
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: stalling }));

  await runtime.modelKind(row);
  // Nothing held says what the model is, so a read that must not wait takes the caller's cold reading.
  expect(await runtime.modelKind(row, { cachedFacts: true, coldAs: "embedding" })).toBe("embedding");

  show.stalls = false;
  expect(await runtime.modelKind(row)).toBe("embedding");
  expect(await runtime.modelKind(row, { cachedFacts: true, coldAs: "generation" })).toBe("embedding");
}, 30_000);

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
