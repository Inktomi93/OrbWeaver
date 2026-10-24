// @subject packages/inference/src/roles/executor.ts
// @subject packages/inference/src/roles/role-clients.ts
// @subject packages/server/src/domain/embeddings/verbs/runtime-connection.ts

import { expect } from "@orb/testkit/node";
import { EMBEDDING_PATH, fundingConnection, INPUTS, pinGeneration, REPOINTED_MODEL, test } from "./runtime-funding.fixtures.ts";

test("the role bundle follows a repointed binding on its next call", async ({ app, harness, ownerCaller, fundingProvider }) => {
  const first = await fundingConnection({ ownerCaller, harness, task: "summarize" });
  const second = await fundingConnection({ ownerCaller, harness, task: "summarize" });
  await ownerCaller.connection.setBinding({ task: "summarize", connectionId: first.connectionId });
  const roles = await app.roleClientsFor(harness.ownerId);
  expect((await roles.resolved("summarize"))?.connectionId).toBe(first.connectionId);
  await roles.summarize(INPUTS);
  await ownerCaller.connection.setBinding({ task: "summarize", connectionId: second.connectionId });
  expect((await roles.resolved("summarize"))?.connectionId).toBe(second.connectionId);
  await roles.summarize(INPUTS);
  expect(fundingProvider.calls).toHaveLength(2);
});

test("a pinned encoder rechecks authority without changing its admitted model or geometry", async ({ harness, ownerCaller, fundingProvider }) => {
  const captured = await fundingConnection({ ownerCaller, harness, task: "embed" });
  const pinned = await pinGeneration(harness, "embed", captured.connectionId);
  const snapshot = pinned.connection;
  expect(pinned.dims).toBe(3);
  const settledCalls = [...fundingProvider.calls];
  const settledBodies = fundingProvider.requestBodies.length;
  expect((await snapshot.embed("before model change")).vectors[0]).toEqual(new Float32Array([1, 0, 0]));
  expect(fundingProvider.calls).toEqual([...settledCalls, EMBEDDING_PATH]);
  fundingProvider.embedding(REPOINTED_MODEL, [1, 0, 0, 0, 0, 0, 0]);
  const beforeMove = fundingProvider.requestBodies.length;
  await ownerCaller.connection.update({
    connectionId: captured.connectionId,
    patch: { model: REPOINTED_MODEL, declared: { kind: "embedding", embedding: { dims: 7, input: ["text"] }, features: { detectServer: false } } },
  });
  await harness.settleBackground();
  const moveBodies = fundingProvider.requestBodies.slice(beforeMove);
  expect(moveBodies.map((body) => JSON.parse(body))).toMatchObject([{ model: REPOINTED_MODEL }]);
  expect((await harness.app.embeddings.resolveGeneration(harness.ownerId, "embed"))?.dims).toBe(7);
  expect((await snapshot.embed("after model change")).vectors[0]).toEqual(new Float32Array([1, 0, 0]));
  expect(fundingProvider.calls).toEqual([...settledCalls, EMBEDDING_PATH, EMBEDDING_PATH, EMBEDDING_PATH]);
  expect(fundingProvider.requestBodies.slice(settledBodies).map((body) => JSON.parse(body))).toMatchObject([
    { model: captured.model, input: ["before model change"] },
    { model: REPOINTED_MODEL },
    { model: captured.model, input: ["after model change"] },
  ]);
});
