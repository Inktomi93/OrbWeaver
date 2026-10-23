// @subject packages/inference/src/roles/executor.ts
// @subject packages/inference/src/roles/role-clients.ts
// @subject packages/server/src/domain/embeddings/verbs/runtime-connection.ts

import "@orb/testkit/node/composed-real.ts";
import type { EmbeddingTask } from "@orb/contracts/embeddings";
import type { Task } from "@orb/contracts/inference";
import { bindingTaskOf, TASKS, taskDef } from "@orb/contracts/inference";
import type { RoleClientTask } from "@orb/contracts/role-clients";
import { ROLE_CLIENT_TASKS } from "@orb/contracts/role-clients";
import { auditLogs, embeddingCalls } from "@orb/db";
import type { InferenceRuntime, ProviderExecutor, Resolved, RoleClientsWithSignal } from "@orb/inference";
import { NoConnectionError } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { TEST_BASE_URL, TEST_PROVIDER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import type { Fixtures } from "@orb/testkit/node/fixtures.ts";
import { expect } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { FUNDING_KEY, FUNDING_MODEL, fundingConnection, test } from "./runtime-funding.fixtures.ts";

type BackgroundTask = Exclude<Task, "chat" | "agent" | "generateImage">;
type Execute = (runtime: InferenceRuntime, connection: Resolved) => ReturnType<ProviderExecutor[keyof ProviderExecutor]>;

const INPUTS = [{ systemPrompt: "Answer briefly.", userPrompt: "A funding control." }];
const FORMAT = { name: "funding_answer", schema: projectJsonSchema(z.strictObject({ answer: z.string() })) };
const EMBEDDING_PATH = `${new URL(TEST_BASE_URL).pathname.replace(/\/$/u, "")}/embeddings`;
const REPOINTED_MODEL = "different-funding-model";

async function pinGeneration(
  harness: Fixtures["harness"],
  task: EmbeddingTask,
  connectionId: Resolved["connectionId"],
): Promise<NonNullable<Awaited<ReturnType<Fixtures["app"]["embeddings"]["resolveGeneration"]>>>> {
  await harness.services.connection.setBinding({ principal: await harness.principalFor(harness.ownerId), task, connectionId });
  await harness.settleBackground();
  const generation = await harness.app.embeddings.resolveGeneration(harness.ownerId, task);
  if (generation === null) {
    throw new Error("the real bound encoder did not produce a pinned generation");
  }
  await harness.settleBackground();
  return generation;
}
const EXECUTE: Record<BackgroundTask, Execute> = {
  embed: (runtime, connection) => runtime.executor.embed({ connection: { ...connection, task: "embed" }, input: "funding control" }),
  imageEmbed: (runtime, connection) =>
    runtime.executor.imageEmbed({ connection: { ...connection, task: "imageEmbed" }, input: { kind: "text", input: "funding control" } }),
  rerank: (runtime, connection) =>
    runtime.executor.rerank({ connection: { ...connection, task: "rerank" }, query: "control", documents: [{ id: "document", text: "control" }] }),
  summarize: (runtime, connection) => runtime.executor.summarize({ connection: { ...connection, task: "summarize" }, inputs: INPUTS }),
  structured: (runtime, connection) =>
    runtime.executor.structured({ connection: { ...connection, task: "structured" }, inputs: INPUTS, responseFormat: FORMAT }),
};

const BACKGROUND_TASKS = TASKS.filter((task): task is BackgroundTask => taskDef(task).spend === "background");

for (const task of BACKGROUND_TASKS) {
  test(`${task} refuses withdrawn consent before the physical call and accounting`, async ({ app, harness, db, ownerCaller, fundingProvider }) => {
    const captured = await fundingConnection({ ownerCaller, harness, task });
    const run = EXECUTE[task];
    await run(app.runtime, captured);
    expect(fundingProvider.calls).toHaveLength(1);
    const priorAccounting = await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId));

    await ownerCaller.connection.update({ connectionId: captured.connectionId, patch: { allowBackground: false } });
    await expect(run(app.runtime, captured)).rejects.toBeInstanceOf(NoConnectionError);
    expect(fundingProvider.calls).toHaveLength(1);
    expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId))).toEqual(priorAccounting);
  });
}

for (const task of ["embed", "imageEmbed"] as const) {
  test(`a pinned ${task} snapshot reads current consent on its next call`, async ({ harness, db, ownerCaller, fundingProvider }) => {
    const captured = await fundingConnection({ ownerCaller, harness, task });
    const generation = await pinGeneration(harness, task, captured.connectionId);
    const snapshot = generation.connection;
    expect(generation.dims).toBe(3);
    expect(snapshot.connectionId).toBe(captured.connectionId);
    const settledCalls = [...fundingProvider.calls];
    const run = (): ReturnType<typeof snapshot.embed> | ReturnType<typeof snapshot.imageEmbed> =>
      task === "embed" ? snapshot.embed("funding control") : snapshot.imageEmbed({ kind: "text", input: "funding control" });
    expect((await run()).vectors[0]).toEqual(new Float32Array([1, 0, 0]));
    expect(fundingProvider.calls).toEqual([...settledCalls, EMBEDDING_PATH]);
    const beforeRefusal = [...fundingProvider.calls];
    const beforeAccounting = await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId));
    await ownerCaller.connection.update({ connectionId: captured.connectionId, patch: { allowBackground: false } });
    await expect(run()).rejects.toBeInstanceOf(NoConnectionError);
    expect(fundingProvider.calls).toEqual(beforeRefusal);
    expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId))).toEqual(beforeAccounting);
  });
}

test("a pinned encoder refuses a credential revoked after resolution", async ({ harness, db, ownerCaller, fundingProvider }) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: FUNDING_KEY, metadata: { auth: "endpoint" } });
  const captured = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
  const snapshot = (await pinGeneration(harness, "embed", captured.connectionId)).connection;
  const settledCalls = [...fundingProvider.calls];
  expect((await snapshot.embed("before revoke")).vectors[0]).toEqual(new Float32Array([1, 0, 0]));
  expect(fundingProvider.calls).toEqual([...settledCalls, EMBEDDING_PATH]);
  const beforeAccounting = await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId));
  await ownerCaller.credentials.markRevokedByUser({ credentialId: key.id });
  await expect(snapshot.embed("after revoke")).rejects.toBeInstanceOf(DomainNoCredentialError);
  expect(fundingProvider.calls).toEqual([...settledCalls, EMBEDDING_PATH]);
  expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId))).toEqual(beforeAccounting);
});

for (const task of BACKGROUND_TASKS) {
  test(`${task} provider auth failure revokes exactly the dispatched credential once`, async ({ app, harness, db, ownerCaller, fundingProvider }) => {
    const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: FUNDING_KEY, metadata: { auth: "endpoint" } });
    const spare = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "unused-funding-test-key", metadata: { auth: "endpoint" } });
    const captured = await fundingConnection({ ownerCaller, harness, task, credentialId: key.id });
    fundingProvider.status(401);
    await expect(EXECUTE[task](app.runtime, captured)).toThrowProviderError("auth_failed");
    const keys = await ownerCaller.credentials.list();
    expect(keys.find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
    expect(keys.find((row) => row.id === spare.id)?.revokedAt).toBeNull();
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(1);
    expect(fundingProvider.calls).toHaveLength(1);
  });
}

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

test("a pinned encoder whose real connection was removed refuses without a provider or accounting purchase", async ({
  harness,
  db,
  ownerCaller,
  fundingProvider,
}) => {
  const captured = await fundingConnection({ ownerCaller, harness, task: "embed" });
  const snapshot = (await pinGeneration(harness, "embed", captured.connectionId)).connection;
  const settledCalls = [...fundingProvider.calls];
  const settledAccounting = await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, harness.ownerId));
  await snapshot.embed("before removal");
  expect(fundingProvider.calls).toEqual([...settledCalls, EMBEDDING_PATH]);
  const beforeRemoval = await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, harness.ownerId));
  expect(beforeRemoval).toHaveLength(settledAccounting.length + 1);
  await ownerCaller.connection.remove({ connectionId: captured.connectionId });
  const priorAccounting = await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, harness.ownerId));
  expect(priorAccounting).toEqual(beforeRemoval.map((row) => ({ ...row, connectionId: null })));
  await expect(snapshot.embed("after removal")).toThrowProviderError("invalid");
  expect(fundingProvider.calls).toEqual([...settledCalls, EMBEDDING_PATH]);
  expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, harness.ownerId))).toEqual(priorAccounting);
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

const BOUND_EXECUTE: Record<RoleClientTask, (roles: RoleClientsWithSignal) => ReturnType<RoleClientsWithSignal[RoleClientTask]>> = {
  embed: (roles) => roles.embed("funding control"),
  imageEmbed: (roles) => roles.imageEmbed({ kind: "text", input: "funding control" }),
  rerank: (roles) => roles.rerank("control", [{ id: "document", text: "control" }]),
  summarize: (roles) => roles.summarize(INPUTS),
  structured: (roles) => roles.structured(INPUTS, { responseFormat: FORMAT }),
};

for (const task of ROLE_CLIENT_TASKS) {
  test(`the bound ${task} caller re-reads its owner's current funding without making a refused purchase`, async ({
    app,
    harness,
    db,
    ownerCaller,
    fundingProvider,
  }) => {
    const captured = await fundingConnection({ ownerCaller, harness, task });
    await ownerCaller.connection.setBinding({ task: bindingTaskOf(task), connectionId: captured.connectionId });
    const roles = await app.roleClientsFor(harness.ownerId);
    await BOUND_EXECUTE[task](roles);
    expect(fundingProvider.calls).toHaveLength(1);
    const before = await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId));
    await ownerCaller.connection.update({ connectionId: captured.connectionId, patch: { allowBackground: false } });
    await expect(BOUND_EXECUTE[task](roles)).rejects.toBeInstanceOf(NoConnectionError);
    expect(fundingProvider.calls).toHaveLength(1);
    expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId))).toEqual(before);
  });
}

for (const task of BACKGROUND_TASKS) {
  test(`the ${task} executor refuses a currently revoked key before provider I/O or new accounting`, async ({
    app,
    harness,
    db,
    ownerCaller,
    fundingProvider,
  }) => {
    const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: FUNDING_KEY, metadata: { auth: "endpoint" } });
    const captured = await fundingConnection({ ownerCaller, harness, task, credentialId: key.id });
    await EXECUTE[task](app.runtime, captured);
    expect(fundingProvider.calls).toHaveLength(1);
    const before = await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId));
    await ownerCaller.credentials.markRevokedByUser({ credentialId: key.id });
    await expect(EXECUTE[task](app.runtime, captured)).rejects.toBeInstanceOf(DomainNoCredentialError);
    expect(fundingProvider.calls).toHaveLength(1);
    expect(await db.select().from(embeddingCalls).where(eq(embeddingCalls.connectionId, captured.connectionId))).toEqual(before);
  });
}

test("a foreign and then missing real connection have one refusal without provider I/O or accounting", async ({
  app,
  harness,
  db,
  ownerCaller,
  otherCaller,
  fundingProvider,
}) => {
  const foreign = await otherCaller.connection.create({ providerId: TEST_PROVIDER_ID, model: FUNDING_MODEL, credentialId: null, baseUrl: TEST_BASE_URL });
  const other = await otherCaller.sessions.me();
  const admitted = await app.runtime.resolve({
    task: "chat",
    principal: await harness.principalFor(other.userId),
    connectionId: foreign.id,
    cachedFacts: true,
  });
  expect(admitted.resolved.connectionId).toBe(foreign.id);
  const principal = await harness.principalFor(harness.ownerId);
  const requests = [...fundingProvider.requests];
  const before = await db.select().from(embeddingCalls);
  const denied = await app.runtime.resolve({ task: "chat", principal, connectionId: foreign.id, cachedFacts: true }).then(
    () => {
      throw new Error("the foreign connection unexpectedly resolved");
    },
    (error: unknown) => {
      if (!(error instanceof NoConnectionError)) {
        throw error;
      }
      return error;
    },
  );
  expect(denied).toBeInstanceOf(NoConnectionError);
  expect(fundingProvider.requests).toEqual(requests);
  await otherCaller.connection.remove({ connectionId: foreign.id });
  await expect(app.runtime.resolve({ task: "chat", principal, connectionId: foreign.id, cachedFacts: true })).rejects.toMatchObject({
    name: denied.name,
    kind: denied.kind,
    message: denied.message,
  });
  expect(fundingProvider.requests).toEqual(requests);
  expect(await db.select().from(embeddingCalls)).toEqual(before);
  expect(await ownerCaller.credentials.list()).toEqual([]);
});
