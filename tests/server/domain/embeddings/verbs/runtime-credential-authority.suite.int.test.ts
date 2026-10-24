// @subject packages/inference/src/roles/executor.ts
// @subject packages/server/src/domain/imagery/verbs/image-provider-ops.ts
// @subject packages/server/src/domain/rpg/tools/rounds/resync.ts

import { generationOf, toChatRequest } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { createResolveEmbeddingConnection } from "@orb/server/domain/embeddings";
import { createImageProviderOps } from "@orb/server/domain/imagery";
import { expect } from "@orb/testkit/node";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { fundingConnection, test } from "./runtime-funding.fixtures.ts";

test("a current credential linkage cannot silently reroute a captured execution", async ({ app, harness, ownerCaller, fundingProvider }) => {
  const first = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "first-funding-key", metadata: { auth: "endpoint" } });
  const second = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "second-funding-key", metadata: { auth: "endpoint" } });
  const captured = await fundingConnection({ ownerCaller, harness, task: "summarize", credentialId: first.id });
  const request = { connection: captured, inputs: [{ systemPrompt: "Answer briefly.", userPrompt: "A funding control." }] };
  await app.runtime.executor.summarize(request);
  await ownerCaller.connection.update({ connectionId: captured.connectionId, patch: { credentialId: second.id } });
  await expect(app.runtime.executor.summarize(request)).toThrowProviderError("invalid");
  expect(fundingProvider.calls).toHaveLength(1);
  const fresh = await app.runtime.resolve({ task: "summarize", principal: await harness.principalFor(harness.ownerId), connectionId: captured.connectionId });
  await app.runtime.executor.summarize({ ...request, connection: { ...fresh.resolved, task: "summarize" } });
  expect(fundingProvider.calls).toHaveLength(2);
  await ownerCaller.credentials.remove({ credentialId: second.id });
  await expect(app.runtime.executor.summarize({ ...request, connection: { ...fresh.resolved, task: "summarize" } })).toThrowProviderError("invalid");
  expect(fundingProvider.calls).toHaveLength(2);
});

test("in-place key replacement before the next pinned call uses the current decrypted material", async ({ app, harness, ownerCaller, fundingProvider }) => {
  const before = "before-replacement-funding-key";
  const after = "after-replacement-funding-key";
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: before, metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
  const snapshot = await createResolveEmbeddingConnection(app.runtime, harness.principalFor)(harness.ownerId, "embed", connection.connectionId);
  if (snapshot === null) {
    throw new Error("the saved encoder did not resolve");
  }
  await snapshot.embed("a replacement control");
  await ownerCaller.credentials.replace({ credentialId: key.id, key: after });
  await snapshot.embed("a replacement control");
  expect(fundingProvider.authorizations).toEqual([`Bearer ${before}`, `Bearer ${after}`]);
  expect(fundingProvider.calls).toHaveLength(2);
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedAt).toBeNull();
});

for (const cancel of [false, true]) {
  test(`an ${cancel ? "aborted" : "active"} owned signal ${cancel ? "preserves" : "strikes"} a provider-rejected key`, async ({
    app,
    harness,
    ownerCaller,
    fundingProvider,
  }) => {
    const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "cancel-funding-key", metadata: { auth: "endpoint" } });
    const connection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
    const controller = new AbortController();
    fundingProvider.cancelFailures(cancel ? controller : null);
    fundingProvider.status(401);
    await expect(app.runtime.executor.embed({ connection, input: "cancellation control", signal: controller.signal })).toThrowProviderError("auth_failed");
    expect(controller.signal.aborted).toBe(cancel);
    expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe(cancel ? null : "auth_failed");
    expect(fundingProvider.calls).toHaveLength(1);
  });
}

test("imagery's real provider op reports an auth rejection against its dispatched key", async ({ app, harness, ownerCaller, fundingProvider }) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "image-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "generateImage", credentialId: key.id, allowBackground: false });
  const imagery = createImageProviderOps({ resolve: app.runtime.resolve, generateImage: app.runtime.executor.generateImage });
  const request = { connection, model: connection.model, capability: generationOf(connection), prompt: "A funding control." };
  expect((await imagery.generateImage(request)).images).toHaveLength(1);
  fundingProvider.status(401);
  await expect(imagery.generateImage(request)).toThrowProviderError("auth_failed");
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(fundingProvider.calls).toHaveLength(2);
  const requests = [...fundingProvider.requests];
  await expect(imagery.generateImage(request)).rejects.toBeInstanceOf(DomainNoCredentialError);
  expect(fundingProvider.requests).toEqual(requests);
});

test("the chat executor reports an auth rejection on a foreground-only connection", async ({ app, harness, ownerCaller, fundingProvider }) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "chat-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "chat", credentialId: key.id, allowBackground: false });
  const request = toChatRequest({
    connection,
    params: {},
    systemPrompt: { static: "Answer briefly.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "A funding control." }] }],
  });
  expect((await app.runtime.executor.runChatTurn(request)).reply.length).toBeGreaterThan(0);
  fundingProvider.status(401);
  await expect(app.runtime.executor.runChatTurn(request)).toThrowProviderError("auth_failed");
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(fundingProvider.calls).toHaveLength(2);
  const requests = [...fundingProvider.requests];
  await expect(app.runtime.executor.runChatTurn(request)).rejects.toBeInstanceOf(DomainNoCredentialError);
  expect(fundingProvider.requests).toEqual(requests);
});
