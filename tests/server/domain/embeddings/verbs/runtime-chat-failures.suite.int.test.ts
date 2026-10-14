// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/inference/src/roles/executor.ts
// @subject packages/inference/src/roles/role-clients.ts

import "@orb/testkit/node/composed-real.ts";
import type { LibSqlWrap } from "@orb/db";
import { auditLogs, userCredentials } from "@orb/db";
import { ProviderError } from "@orb/inference";
import { getLog } from "@orb/server/foundation/observability";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { fundingConnection, fundingRoom, test } from "./runtime-funding.fixtures.ts";

type NativeDriver = Parameters<LibSqlWrap>[0];
type DriverStatement = Parameters<Awaited<ReturnType<NativeDriver["transaction"]>>["execute"]>[0];

for (const status of [401, 402]) {
  test(`the actual chat send engine preserves a ${status} provider failure without a duplicate or incorrect strike`, async ({
    app,
    harness,
    db,
    ownerCaller,
    fundingProvider,
  }) => {
    const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "engine-funding-key", metadata: { auth: "endpoint" } });
    const connection = await fundingConnection({ ownerCaller, harness, task: "chat", credentialId: key.id, allowBackground: false });
    await ownerCaller.connection.setBinding({ task: "chat", connectionId: connection.connectionId });
    const chatId = await fundingRoom(ownerCaller);
    const successful = await app.services.chat.send({ principal: await harness.principalFor(harness.ownerId), chatId, content: "The first funding control." });
    expect(successful.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(successful.messages).toMatchObject([
      { role: "user", chatId, content: "The first funding control.", authorUserId: harness.ownerId },
      { role: "assistant", chatId, content: JSON.stringify({ answer: "funded" }), connectionId: connection.connectionId },
    ]);
    expect((await ownerCaller.chat.listMessages({ chatId })).messages.map((message) => message.id)).toEqual(successful.messages.map((message) => message.id));
    const successfulCalls = fundingProvider.calls.length;
    expect(successfulCalls).toBeGreaterThan(0);
    fundingProvider.status(status);
    let received: Error | undefined;
    try {
      await app.services.chat.send({ principal: await harness.principalFor(harness.ownerId), chatId, content: "The failure control." });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      received = error;
    }
    expect(received).toBeInstanceOf(ProviderError);
    expect(received).toBe(fundingProvider.errors.at(-1));
    expect(received).toMatchObject({ kind: status === 401 ? "auth_failed" : "billing" });
    const keyNow = (await ownerCaller.credentials.list()).find((row) => row.id === key.id);
    expect(keyNow?.revokedReason).toBe(status === 401 ? "auth_failed" : null);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(status === 401 ? 1 : 0);
    expect(fundingProvider.calls).toHaveLength(successfulCalls + 1);
  });
}

test("the actual role bundle reports a provider rejection only once", async ({ app, harness, db, ownerCaller, fundingProvider }) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "role-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "summarize", credentialId: key.id });
  await ownerCaller.connection.setBinding({ task: "summarize", connectionId: connection.connectionId });
  const roles = await app.roleClientsFor(harness.ownerId);
  const inputs = [{ systemPrompt: "Answer briefly.", userPrompt: "A funding control." }];
  await roles.summarize(inputs);
  fundingProvider.status(401);
  await expect(roles.summarize(inputs)).toThrowProviderError("auth_failed");
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(1);
  expect(fundingProvider.calls).toHaveLength(2);
});

test("a real credential persistence failure is reported without replacing the provider error or exposing sealed material", async ({
  app,
  harness,
  db,
  ownerCaller,
  fundingProvider,
  fundingDriver,
}) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "database-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
  await app.runtime.executor.embed({ connection, input: "a positive funding control" });
  const client = fundingDriver.client;
  if (client === null) {
    throw new Error("the real libSQL constructor did not deliver its driver observation");
  }
  const [sealed] = await db
    .select({ ciphertext: userCredentials.ciphertext, iv: userCredentials.iv, tag: userCredentials.tag })
    .from(userCredentials)
    .where(and(eq(userCredentials.id, key.id), eq(userCredentials.ownerId, harness.ownerId)));
  if (sealed === undefined) {
    throw new Error("the actual owned credential was not persisted");
  }
  const secondary = new Error(`the observed credential write failed: ${JSON.stringify(sealed)}`);
  const execute = client.execute.bind(client);
  let failedWrites = 0;
  const report = vi.spyOn(getLog(), "error");
  try {
    const write = vi.spyOn(client, "execute").mockImplementation((statement: DriverStatement, args?: Parameters<NativeDriver["execute"]>[1]) => {
      const text = typeof statement === "string" ? statement : statement.sql;
      if (text.startsWith('update "user_credentials" set ')) {
        failedWrites += 1;
        return Promise.reject(secondary);
      }
      return typeof statement === "string" ? execute(statement, args) : execute(statement);
    });
    try {
      fundingProvider.status(401);
      let received: Error | undefined;
      try {
        await app.runtime.executor.embed({ connection, input: "a failed funding control" });
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        received = error;
      }
      expect(received).toBe(fundingProvider.errors[0]);
      expect(received).toMatchObject({ kind: "auth_failed" });
      expect(failedWrites).toBe(1);
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ credentialId: key.id, err: expect.any(String) }), expect.any(String));
      const views = await ownerCaller.credentials.list();
      expect(views.find((row) => row.id === key.id)?.revokedAt).toBeNull();
      const logBytes = JSON.stringify(report.mock.calls);
      const viewBytes = JSON.stringify(views);
      for (const material of Object.values(sealed)) {
        expect(logBytes).not.toContain(material);
        expect(logBytes).not.toContain(JSON.stringify(material).slice(1, -1));
        expect(viewBytes).not.toContain(material);
      }
      expect(fundingProvider.calls).toHaveLength(2);
    } finally {
      write.mockRestore();
    }
  } finally {
    report.mockRestore();
  }
});

test("a real accounting settlement failure retains the provider cause and still strikes only the dispatched key", async ({
  app,
  harness,
  db,
  ownerCaller,
  fundingProvider,
  fundingDriver,
}) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "accounting-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
  const client = fundingDriver.client;
  if (client === null) {
    throw new Error("the real driver was not observed");
  }
  const secondary = new Error("the physical accounting settlement write failed");
  const execute = client.execute.bind(client);
  let failedWrites = 0;
  using _write = vi.spyOn(client, "execute").mockImplementation((statement: DriverStatement, args?: Parameters<NativeDriver["execute"]>[1]) => {
    const text = typeof statement === "string" ? statement : statement.sql;
    if (text.startsWith('update "embedding_calls" set ')) {
      failedWrites += 1;
      return Promise.reject(secondary);
    }
    return typeof statement === "string" ? execute(statement, args) : execute(statement);
  });
  fundingProvider.status(401);
  const failure = await app.runtime.executor.embed({ connection, input: "the accounting passenger control" }).then(
    () => {
      throw new Error("the provider refusal unexpectedly succeeded");
    },
    (error: unknown) => {
      if (!(error instanceof AggregateError)) {
        throw error;
      }
      return error;
    },
  );
  expect(failedWrites).toBe(1);
  expect(failure.cause).toBe(fundingProvider.errors[0]);
  expect(failure.errors).toEqual([fundingProvider.errors[0], expect.objectContaining({ cause: secondary })]);
  expect(fundingProvider.errors[0]).toMatchObject({ kind: "auth_failed", apiErrorStatus: 401 });
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(1);
  expect(fundingProvider.calls).toHaveLength(1);
});
