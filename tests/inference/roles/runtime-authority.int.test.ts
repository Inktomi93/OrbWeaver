// @subject packages/inference/src/roles/executor.ts
// @subject packages/inference/src/resolve/resolve-task.ts
import { embeddingCalls } from "@orb/db";
import { NoConnectionError, ProviderError } from "@orb/inference";
import { DEFAULT_EMBED_MODEL } from "@orb/testkit/iso/inference-identities.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { physicalSdkScenario } from "../backends/agent-sdk/regression-edge.fixtures.ts";
import { createRuntimeRoot, RUNTIME_ENDPOINT, RUNTIME_KEY, RUNTIME_TOKEN, runtimeConnection } from "./runtime.fixtures.ts";

const INPUT = { systemPrompt: "Summarize.", userPrompt: "An owned scene." };

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

test("a real owned HTTP connection executes, then current funding consent refuses the captured connection before another send", async () => {
  const authorizations: (string | null)[] = [];
  const providerFetch: typeof fetch = (_input, init) => {
    authorizations.push(new Request(_input, init).headers.get("authorization"));
    return Promise.resolve(
      new Response(`data: {"choices":[{"index":0,"delta":{"content":"summary"}}]}\n\n${terminalSseLine()}\n\n`, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
  };
  await using root = await createRuntimeRoot({ providerFetch });
  const connection = await runtimeConnection(root, "summarize", {
    providerId: "custom-openai",
    model: "fixture-model",
    baseUrl: RUNTIME_ENDPOINT,
    key: RUNTIME_KEY,
    allowBackground: true,
    declared: { kind: "generation", features: { detectServer: false } },
  });
  expect((await root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).items[0]?.text).toBe("summary");
  expect(authorizations).toEqual([`Bearer ${RUNTIME_KEY}`]);
  await root.services.connection.update({
    principal: await root.principalFor(root.ownerId),
    connectionId: connection.connectionId,
    patch: { allowBackground: false },
  });
  await expect(root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).rejects.toMatchObject({ name: "NoConnectionError", retryable: false });
  expect(authorizations).toHaveLength(1);
});

test("a saved subscription credential reaches native Query and a current revocation refuses before another physical spawn", async () => {
  await using edge = physicalSdkScenario({
    frames: [
      { type: "system", subtype: "init", apiKeySource: "none", model: "claude-opus-5" },
      { type: "assistant", message: { content: [{ type: "text", text: "summary" }], ["stop_reason"]: "end_turn" } },
      {
        type: "result",
        subtype: "success",
        ["is_error"]: false,
        ["num_turns"]: 1,
        ["duration_api_ms"]: 1,
        ["terminal_reason"]: "completed",
        ["total_cost_usd"]: 0,
        errors: [],
        ["permission_denials"]: [],
        usage: { ["input_tokens"]: 5, ["output_tokens"]: 3 },
        modelUsage: {},
      },
    ],
  });
  await using root = await createRuntimeRoot({ sdkSpawn: edge.spawn });
  const connection = await runtimeConnection(root, "summarize", {
    providerId: "claude-sub",
    model: "claude-opus-5",
    baseUrl: null,
    key: RUNTIME_TOKEN,
    allowBackground: true,
  });
  expect((await root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).items[0]?.text).toBe("summary");
  expect(edge.environments.map((env) => env["CLAUDE_CODE_OAUTH_TOKEN"])).toEqual([RUNTIME_TOKEN]);
  const credentialId = connection.credential.credentialId;
  if (credentialId === null) {
    throw new Error("the persisted subscription lost its credential");
  }
  await root.services.credentials.markRevokedByUser({ principal: await root.principalFor(root.ownerId), credentialId });
  await expect(root.app.runtime.executor.summarize({ connection, inputs: [INPUT] })).rejects.toThrow();
  expect(edge.children).toHaveLength(1);
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
