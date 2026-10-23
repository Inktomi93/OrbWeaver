// @subject packages/inference/src/roles/executor.ts
// @subject packages/server/src/domain/imagery/verbs/image-provider-ops.ts
// @subject packages/server/src/domain/rpg/tools/rounds/resync.ts

import { RPG_NO_CHANGES_TOOL, RPG_STATE_CHANGES_FIELD } from "@orb/contracts/rpg";
import { auditLogs } from "@orb/db";
import { generationOf, ProviderError, toChatRequest } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { createResolveEmbeddingConnection } from "@orb/server/domain/embeddings";
import { createImageProviderOps } from "@orb/server/domain/imagery";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
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

test("nested real provider failure preserves its original outer object and strikes once", async ({ app, harness, db, ownerCaller, fundingProvider }) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "nested-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: key.id });
  fundingProvider.wrapFailures(true);
  fundingProvider.status(401);
  let received: Error | undefined;
  try {
    await app.runtime.executor.embed({ connection, input: "nested provider failure" });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    received = error;
  }
  expect(received).toBe(fundingProvider.errors[0]);
  expect(received?.cause).toBeInstanceOf(ProviderError);
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(1);
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

test("an HTTP stream transport failure preserves the normalized error without inventing an auth verdict", async ({
  app,
  harness,
  db,
  ownerCaller,
  fundingProvider,
}) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "stream-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "chat", credentialId: key.id });
  const { chat } = await ownerCaller.chat.startChat({ characterIds: [], opening: "none" });
  const stream = fundingProvider.holdChatStream();
  const deltaReady = Promise.withResolvers<void>();
  const text: string[] = [];
  const request = toChatRequest({
    connection,
    params: {},
    systemPrompt: { static: "Answer briefly.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "A funding control." }] }],
    chatId: chat.id,
    onDelta: (delta): void => {
      if (delta.kind === "text") {
        text.push(delta.text);
        deltaReady.resolve();
      }
    },
  });
  let settled = false;
  const call = app.runtime.executor.runChatTurn(request);
  const monitor = call.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await deltaReady.promise;
  expect(text.join("")).toBe("partial funding response");
  expect(settled).toBe(false);
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedAt).toBeNull();
  const failure = new Error("the physical HTTP stream failed");
  await stream.fail(failure);
  await monitor;
  await expect(call).rejects.toBe(fundingProvider.errors[0]);
  expect(fundingProvider.errors[0]).toMatchObject({ kind: "unknown", apiErrorStatus: 200 });
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedAt).toBeNull();
  expect(fundingProvider.calls).toHaveLength(1);
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(0);
});

test("the admitted native agent executor crosses the same current authority and strike-out boundary", async ({ app, harness, db, ownerCaller, nativeSdk }) => {
  const providerId = "claude-sub";
  const key = await ownerCaller.credentials.add({ provider: providerId, key: "sdk-funding-token", metadata: { auth: "oauthToken" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "agent", providerId, baseUrl: null, credentialId: key.id, cachedFacts: true });
  const chat = await app.runtime.resolve({
    task: "chat",
    principal: await harness.principalFor(harness.ownerId),
    connectionId: connection.connectionId,
    cachedFacts: true,
  });
  const mounted = toChatRequest({
    connection: { ...chat.resolved, task: "chat" },
    params: {},
    systemPrompt: { static: "Answer briefly.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "A funding control." }] }],
    tools: {
      offer: {
        definitions: [],
        turnLimit: 1,
        execute: (): never => {
          throw new Error("unscripted funding tool execution");
        },
      },
    },
  });
  if (mounted.api !== "agent-sdk" || mounted.toolServer === undefined) {
    throw new Error("the SDK projection did not mount its real tool server");
  }
  const prior = nativeSdk.children.length;
  await expect(
    app.runtime.executor.runAgentTurn({
      connection,
      systemPrompt: "Answer briefly.",
      prompt: "native-auth-rejection agent funding",
      mcpServer: mounted.toolServer,
    }),
  ).toThrowProviderError("auth_failed");
  expect(nativeSdk.children).toHaveLength(prior + 1);
  expect(nativeSdk.tokens.at(-1)).toBe("sdk-funding-token");
  await expect(
    app.runtime.executor.runAgentTurn({
      connection,
      systemPrompt: "Answer briefly.",
      prompt: "native-auth-rejection agent funding",
      mcpServer: mounted.toolServer,
    }),
  ).rejects.toBeInstanceOf(DomainNoCredentialError);
  expect(nativeSdk.children).toHaveLength(prior + 1);
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(1);
});

test("a native SDK utility rejection settles its owned timer and strikes once", async ({ app, harness, db, ownerCaller, nativeSdk }) => {
  const providerId = "claude-sub";
  const key = await ownerCaller.credentials.add({ provider: providerId, key: "sdk-utility-funding-token", metadata: { auth: "oauthToken" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "summarize", providerId, baseUrl: null, credentialId: key.id, cachedFacts: true });
  await harness.settleBackground();
  const timersBefore = harness.timers.pending();
  let timersAtExecution = -1;
  nativeSdk.onSpawn(() => {
    timersAtExecution = harness.timers.pending();
  });
  const callsBefore = nativeSdk.children.length;
  await expect(
    app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "Answer briefly.", userPrompt: "native-auth-rejection utility funding" }] }),
  ).toThrowProviderError("auth_failed");
  expect(nativeSdk.children).toHaveLength(callsBefore + 1);
  expect(nativeSdk.tokens.at(-1)).toBe("sdk-utility-funding-token");
  expect(timersAtExecution).toBe(timersBefore + 1);
  expect(harness.timers.pending()).toBe(timersBefore);
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(1);
});

for (const vehicle of ["structured", "tools"] as const) {
  test(`RPG's composed ${vehicle} resync strikes the provider-rejected chat key exactly once`, async ({ harness, db, ownerCaller, fundingProvider }) => {
    const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "rpg-funding-key", metadata: { auth: "endpoint" } });
    const connection = await fundingConnection({ ownerCaller, harness, task: "chat", credentialId: key.id, allowBackground: false });
    await ownerCaller.connection.update({
      connectionId: connection.connectionId,
      patch: { declared: { kind: "generation", generation: { tools: { parallel: false }, output: { structured: true } }, features: { detectServer: false } } },
    });
    await ownerCaller.connection.setBinding({ task: "chat", connectionId: connection.connectionId });
    const { chat } = await ownerCaller.chat.startChat({ characterIds: [], opening: "none" });
    await ownerCaller.rpg.createGame({ chatId: chat.id, mode: "lite" });
    await ownerCaller.rpg.updateConfig({ chatId: chat.id, patch: { stateCaptureVehicle: vehicle } });
    await ownerCaller.chat.commitMessage({ chatId: chat.id, timeZone: UTC_TIME_ZONE, content: "The party reaches a quiet crossroads." });
    if (vehicle === "tools") {
      fundingProvider.toolReply(RPG_NO_CHANGES_TOOL, JSON.stringify({}));
    } else {
      fundingProvider.reply(JSON.stringify({ [RPG_STATE_CHANGES_FIELD]: [{ tool: RPG_NO_CHANGES_TOOL, args: {} }] }));
    }
    expect((await ownerCaller.rpg.resyncFromStory({ chatId: chat.id })).ok).toBe(true);
    const successfulCalls = fundingProvider.calls.length;
    expect(successfulCalls).toBeGreaterThan(0);
    fundingProvider.status(401);
    expect((await ownerCaller.rpg.resyncFromStory({ chatId: chat.id })).ok).toBe(false);
    expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
    expect(fundingProvider.calls).toHaveLength(successfulCalls + 1);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(1);
  });
}
