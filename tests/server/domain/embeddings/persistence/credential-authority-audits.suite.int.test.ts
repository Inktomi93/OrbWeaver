// Provider failures across nested, streamed, native agent and SDK utility executors strike their dispatched
// credential once, recorded as one audit_logs row.
// @subject packages/inference/src/roles/executor.ts
// @subject packages/server/src/domain/imagery/verbs/image-provider-ops.ts
// @subject packages/server/src/domain/rpg/tools/rounds/resync.ts

import { RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import { auditLogs } from "@orb/db";
import { ProviderError, toChatRequest } from "@orb/inference";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect } from "@orb/testkit/node";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";
import { RPG_STATE_CHANGES_FIELD } from "#contracts/rpg/structured-round.ts";
import { fundingConnection, test } from "../verbs/runtime-funding.fixtures.ts";

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
