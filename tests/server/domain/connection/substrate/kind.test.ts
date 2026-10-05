import { providerDefSchema } from "@orb/contracts/inference";

// The model KIND the connection domain reads (`runtime.modelKind`), shared by the list view, the bindings writer and
// the diagnostics so they cannot disagree about which slots a row may take. The precedence is the contract: the row's
// own `declared.kind` wins, then what the provider's catalog states, then the curated table, else `generation`.

import { createInferenceRuntime } from "@orb/inference";
import { vi } from "vitest";
import { fakeConnection, fakeDeps, memoryStores, newUserId } from "../../../../inference/_support.ts";
import { expect, test } from "../../../../support/fixtures.ts";

async function kindOf(row: Parameters<typeof fakeConnection>[0]): Promise<string> {
  const runtime = await createInferenceRuntime(fakeDeps({ stores: memoryStores() }));
  return await runtime.modelKind(fakeConnection(row), { cachedFacts: true });
}

test("the curated table answers a known model, and the row's own declaration wins over it", async () => {
  const ownerId = newUserId();
  expect(await kindOf({ ownerId, providerId: "local-light", model: "jinaai/jina-clip-v2" })).toBe("embedding");
  expect(await kindOf({ ownerId, providerId: "local-light", model: "jinaai/jina-clip-v2", declared: { kind: "rerank" } })).toBe("rerank");
});

test("the curated lookup is keyed on the provider too, and a model nothing describes reads as generation", async () => {
  const ownerId = newUserId();
  const elsewhere = { ownerId, providerId: "custom-openai", baseUrl: "http://127.0.0.1:18703/v1" } as const;
  expect(await kindOf({ ...elsewhere, model: "jinaai/jina-clip-v2" })).toBe("generation");
  expect(await kindOf({ ...elsewhere, model: "some-private-finetune" })).toBe("generation");
});

test("cached tasks apply model requirements without dialing or opening a revoked credential", async () => {
  const runtime = await createInferenceRuntime({
    ...fakeDeps({
      stores: memoryStores(),
      fetch: () => Promise.reject(new Error("cached task reads must not dial")),
    }),
    resolveCredential: () => Promise.reject(new Error("cached task reads must not open credentials")),
  });
  const ownerId = newUserId();
  const text = fakeConnection({ ownerId, providerId: "google", model: "gemini-3.5-flash-lite" });
  expect(await runtime.modelTasks(text, { cachedFacts: true })).toEqual(["chat", "summarize", "structured"]);
  expect(await runtime.modelTasks({ ...text, declared: { generation: { output: { modalities: ["text", "image"] } } } }, { cachedFacts: true })).toContain(
    "generateImage",
  );
  const embedder = fakeConnection({
    ownerId,
    providerId: "custom-openai",
    baseUrl: "http://127.0.0.1:18703/v1",
    model: "bge-m3",
    declared: { kind: "embedding", embedding: { input: ["text"] } },
  });
  expect(await runtime.modelTasks(embedder, { cachedFacts: true })).toEqual(["embed"]);
  const local = fakeConnection({ ownerId, providerId: "local-light", model: "jinaai/jina-clip-v2", declared: { embedding: { dtype: "fp32" } } });
  expect(await runtime.modelTasks(local, { cachedFacts: true })).toEqual(["embed", "imageEmbed"]);
});

test("cached image-only tasks need neither a chat API, a credential nor an endpoint dial", async () => {
  const stores = memoryStores();
  const provider = providerDefSchema.parse({
    id: "image-only",
    label: "Image only",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: [],
    serves: ["generateImage"],
    catalog: "url",
    metered: false,
  });
  stores.providerStore.state.admins.set(provider.id, provider);
  const fetch = vi.fn(() => Promise.reject(new Error("cached reads must not dial")));
  const resolveCredential = vi.fn(() => Promise.reject(new Error("cached reads must not open credentials")));
  const runtime = await createInferenceRuntime({ ...fakeDeps({ stores, fetch }), resolveCredential });
  const row = fakeConnection({
    ownerId: newUserId(),
    providerId: provider.id,
    model: "image-model",
    baseUrl: "http://127.0.0.1:18703/v1",
    declared: { kind: "generation", generation: { output: { modalities: ["image"] } } },
  });
  stores.connections.rows.set(row.id, row);
  expect(await runtime.modelTasks(row, { cachedFacts: true })).toEqual(["generateImage"]);
  expect(fetch).not.toHaveBeenCalled();
  expect(resolveCredential).not.toHaveBeenCalled();
});
