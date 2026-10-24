// The runtime embed path writes one embedding_calls row per owned send: a cleared binding refuses implicit
// resolution with the ledger unchanged, and a pre-cancelled local-light embed records no row.
// @subject packages/inference/src/roles/executor.ts
// @subject packages/inference/src/resolve/resolve-task.ts

import { embeddingCalls } from "@orb/db";
import { NoConnectionError, ProviderError } from "@orb/inference";
import { DEFAULT_EMBED_MODEL } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot, RUNTIME_ENDPOINT, RUNTIME_KEY, runtimeConnection } from "../../../../inference/roles/runtime.fixtures.ts";

test("a cleared real embedding binding refuses implicit resolution while its owned row remains explicitly resolvable", async () => {
  const requests: string[] = [];
  const model = "binding-authority-embed";
  const witness = "The bound encoder receives this physical input.";
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname} ${await request.text()}`);
    if (request.method === "GET" && url.pathname.endsWith("/models")) {
      return Response.json({ data: [{ id: model }] });
    }
    if (request.method === "POST" && url.pathname.endsWith("/embeddings")) {
      return Response.json({ model, data: [{ index: 0, embedding: [1, 0, 0] }], usage: { ["prompt_tokens"]: 1, ["total_tokens"]: 1 } });
    }
    throw new Error(`unscripted binding-authority provider request: ${request.method} ${url.pathname}`);
  };
  await using root = await createRuntimeRoot({ providerFetch });
  const connection = await runtimeConnection(root, "embed", {
    providerId: "custom-openai",
    model,
    baseUrl: RUNTIME_ENDPOINT,
    key: RUNTIME_KEY,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3, input: ["text"] }, features: { detectServer: false } },
  });
  const principal = await root.principalFor(root.ownerId);
  await root.services.connection.setBinding({ principal, task: "embed", connectionId: connection.connectionId });
  await root.settleBackground();
  const implicit = await root.app.runtime.resolve({ principal, task: "embed", cachedFacts: true });
  const explicit = await root.app.runtime.resolve({ principal, task: "embed", connectionId: connection.connectionId, cachedFacts: true });
  expect(implicit.resolved.connectionId).toBe(connection.connectionId);
  expect(explicit.resolved.connectionId).toBe(implicit.resolved.connectionId);
  if (implicit.resolved.task !== "embed") {
    throw new Error("the real binding did not resolve its embedding task");
  }
  const result = await root.app.runtime.executor.embed({ connection: { ...implicit.resolved, task: implicit.resolved.task }, input: witness });
  expect(result.vectors[0]).toEqual(new Float32Array([1, 0, 0]));
  expect(requests.some((request) => request.includes("/embeddings") && request.includes(witness))).toBe(true);
  await root.services.connection.setBinding({ principal, task: "embed", connectionId: null });
  await root.settleBackground();
  const beforeRequests = [...requests];
  const beforeAccounting = await root.db.select().from(embeddingCalls);
  expect(beforeAccounting).toEqual(
    expect.arrayContaining([expect.objectContaining({ ownerId: root.ownerId, connectionId: connection.connectionId, task: "embed" })]),
  );
  await expect(root.app.runtime.resolve({ principal, task: "embed", cachedFacts: true })).rejects.toBeInstanceOf(NoConnectionError);
  expect((await root.app.runtime.resolve({ principal, task: "embed", connectionId: connection.connectionId, cachedFacts: true })).resolved.connectionId).toBe(
    connection.connectionId,
  );
  expect(requests).toEqual(beforeRequests);
  expect(await root.db.select().from(embeddingCalls)).toEqual(beforeAccounting);
});

test("a pre-cancelled local-light embedding crosses real accounting without loading a model or exposing the caller reason", async () => {
  await using root = await createRuntimeRoot();
  const connection = await runtimeConnection(root, "embed", { providerId: "local-light", model: DEFAULT_EMBED_MODEL, baseUrl: null, allowBackground: true });
  const cancel = new AbortController();
  cancel.abort(new DOMException("connection timeout network overload", "TimeoutError"));
  const failure = await root.app.runtime.executor.embed({ connection, input: ["cancelled"], signal: cancel.signal }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ProviderError);
  expect(failure).toMatchObject({ kind: "aborted", retryable: false });
  expect(failure instanceof Error && /connection|timeout|network|overload/u.test(failure.message)).toBe(false);
  expect(await root.db.select().from(embeddingCalls)).toEqual([]);
});
