// Role clients resolve at call time, dispatch role options to the selected backend, and preserve the
// provider's original failure while the credential strike-out runs.

import { createInferenceRuntime, DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL, ProviderError } from "@orb/inference";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, fakeModelCache, memoryStores, newUserId } from "../_support.ts";

test("one role-client bundle re-reads a changed binding on the next call", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const first = fakeConnection({ ownerId, providerId: "local-light", model: DEFAULT_EMBED_MODEL, allowBackground: true });
  const second = fakeConnection({
    ownerId,
    providerId: "local-light",
    model: "acme/second-encoder",
    declared: { kind: "embedding", embedding: { dims: 1024, dtype: "q8", input: ["text"] } },
    allowBackground: true,
  });
  stores.connections.rows.set(first.id, first);
  stores.connections.rows.set(second.id, second);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "embed", connectionId: first.id });
  const cache = fakeModelCache();
  const runtime = await createInferenceRuntime({ ...fakeDeps({ stores }), localLight: { cache } });
  const clients = runtime.roleClientsFor(principal(ownerId));

  expect((await clients.embed("first")).model).toBe(`${DEFAULT_EMBED_MODEL}@q8`);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "embed", connectionId: second.id });
  expect((await clients.embed("second")).model).toBe("acme/second-encoder@q8");
  expect(cache.calls.filter((call) => call.method === "embedTexts").map((call) => call.repo)).toEqual([DEFAULT_EMBED_MODEL, "acme/second-encoder"]);
});

test("rerank forwards the instruction and preserves caller ids through the real backend", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "local-light", model: DEFAULT_RERANK_MODEL, allowBackground: true });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "rerank", connectionId: row.id });
  const base = fakeModelCache();
  const queries: string[] = [];
  const cache = {
    ...base,
    scorePairs: (repo: string, query: string, documents: readonly string[]): Promise<number[]> => {
      queries.push(query);
      return base.scorePairs(repo, query, documents);
    },
  };
  const runtime = await createInferenceRuntime({ ...fakeDeps({ stores }), localLight: { cache } });

  const result = await runtime.roleClientsFor(principal(ownerId)).rerank(
    "needle",
    [
      { id: "a", text: "short" },
      { id: "b", text: "much longer" },
    ],
    {
      instruction: "search documents",
    },
  );
  expect(queries).toEqual(["search documents needle"]);
  expect(result.hits.map((hit) => hit.id)).toEqual(["b", "a"]);
});

test("a wrapped provider failure is rethrown unchanged after strike-out", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "local-light", model: DEFAULT_EMBED_MODEL, allowBackground: true });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "embed", connectionId: row.id });
  const providerFailure = new ProviderError({ kind: "auth_failed", retryable: false, message: "bad credential" });
  const wrapper = new Error("backend wrapper", { cause: providerFailure });
  const base = fakeModelCache();
  const cache = { ...base, embedTexts: (): Promise<Float32Array[]> => Promise.reject(wrapper) };
  const strikes: unknown[] = [];
  const deps = {
    ...fakeDeps({ stores }),
    localLight: { cache },
    onAuthFailed: (args: unknown): Promise<void> => {
      strikes.push(args);
      return Promise.resolve();
    },
  };
  const runtime = await createInferenceRuntime(deps);

  await expect(runtime.roleClientsFor(principal(ownerId)).embed("hello")).rejects.toBe(wrapper);
  expect(strikes).toEqual([{ ownerId, credentialId: null, errorKind: "auth_failed", errorMessage: "bad credential" }]);
});

// A background task spends a row only when its owner allowed background work (`canFund`). The role clients
// are the background path, so a row with `allowBackground` off is refused BEFORE any provider call, in the
// same "nothing ran" class as no binding at all — never silently spent.
test("a background role call on a row that disallows background work runs nothing and reads as no connection", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "local-light", model: DEFAULT_EMBED_MODEL, allowBackground: false });
  stores.connections.rows.set(row.id, row);
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "embed", connectionId: row.id });
  const cache = fakeModelCache();
  const runtime = await createInferenceRuntime({ ...fakeDeps({ stores }), localLight: { cache } });
  const clients = runtime.roleClientsFor(principal(ownerId));

  await expect(clients.embed("text")).rejects.toMatchObject({ name: "NoConnectionError", message: expect.stringContaining("background") });
  expect(
    cache.calls.filter((call) => call.method === "embedTexts"),
    "no provider call was made",
  ).toHaveLength(0);
  await expect(clients.resolved("embed")).resolves.toBeNull();
  // PLANTED CONTROL: the same row with background work allowed runs.
  stores.connections.rows.set(row.id, { ...row, allowBackground: true });
  expect((await clients.embed("text")).model).toBe(`${DEFAULT_EMBED_MODEL}@q8`);
});
