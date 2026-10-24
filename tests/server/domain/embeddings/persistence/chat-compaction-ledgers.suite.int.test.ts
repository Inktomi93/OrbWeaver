// Compaction turns at each phase and a late native SDK auth failure record their compaction_spend and
// credential strike audit_logs rows only after terminal settlement.
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// @subject packages/server/src/domain/chat/verbs/quiet-generate.ts
// @subject packages/inference/src/roles/executor.ts

import { auditLogs, compactionSpend } from "@orb/db";
import { ProviderError, toChatRequest } from "@orb/inference";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { getLog } from "@orb/server/foundation/observability";
import { expect } from "@orb/testkit/node";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { GENERATION_INTENT, PHASES, SETTLEMENT, WARNINGS } from "../verbs/runtime-chat-compaction.fixtures.ts";
import { fundingConnection, fundingRoom, test } from "../verbs/runtime-funding.fixtures.ts";

for (const phase of PHASES) {
  test(`a genuine ${phase}-turn compaction rejection settles without repurchasing or corrupting canon`, async ({
    app,
    harness,
    db,
    ownerCaller,
    nativeSdk,
    fundingProvider,
  }) => {
    const token = "native-compaction-funding-token";
    const key = await ownerCaller.credentials.add({ provider: "claude-sub", key: token, metadata: { auth: "oauthToken" } });
    const connection = await fundingConnection({
      ownerCaller,
      harness,
      task: "chat",
      providerId: "claude-sub",
      baseUrl: null,
      credentialId: key.id,
      cachedFacts: true,
      allowBackground: false,
    });
    await ownerCaller.connection.setBinding({ task: "chat", connectionId: connection.connectionId });
    const chatId = await fundingRoom(ownerCaller);
    for (let seq = 0; seq < 16; seq += 1) {
      await ownerCaller.chat.commitMessage({
        chatId,
        timeZone: UTC_TIME_ZONE,
        content: `${phase}-compaction history ${seq}: ${"a remembered funding scene ".repeat(phase === "pre" ? 64 : 1)}`,
      });
    }
    const principal = await harness.principalFor(harness.ownerId);
    const priorSpawns = nativeSdk.tokens.length;
    const warn = vi.spyOn(getLog(), "warn");
    try {
      const call = app.services.chat.send({ principal, chatId, content: `${phase}-compaction funding trigger`, intent: GENERATION_INTENT });
      const committed = await SETTLEMENT[phase](call);
      await vi.waitFor(async () => {
        const events = await app.services.chat.replayChatEvents({ principal, chatId });
        expect(events.some(({ event }) => event.type === "warning" && event.code === "compaction_failed")).toBe(phase === "post");
        expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
      });
      expect(nativeSdk.tokens.slice(priorSpawns)).toEqual(phase === "pre" ? [token] : [token, token]);
      expect(fundingProvider.errors).toHaveLength(1);
      expect(fundingProvider.errors[0]).toBeInstanceOf(ProviderError);
      expect(fundingProvider.errors[0]).toMatchObject({ kind: "auth_failed", apiErrorStatus: 401 });
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ err: fundingProvider.errors[0], chatId }), WARNINGS[phase]);
      expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
      expect(
        await db
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
      ).toHaveLength(1);
      expect(await db.select().from(compactionSpend).where(eq(compactionSpend.ownerId, harness.ownerId))).toHaveLength(0);
      expect(fundingProvider.calls).toHaveLength(0);
      const messages = await ownerCaller.chat.listMessages({ chatId });
      const assistantRows = messages.messages.filter((message) => message.role === "assistant");
      expect(assistantRows).toHaveLength(phase === "pre" ? 0 : 1);
      expect(assistantRows.map((message) => message.id)).toEqual(
        committed?.messages.filter((message) => message.role === "assistant").map((message) => message.id) ?? [],
      );
      expect(assistantRows.map((message) => message.content)).toEqual(phase === "pre" ? [] : ["native funding reply"]);
    } finally {
      warn.mockRestore();
    }
  });
}

test("a real native SDK stream strikes its late auth failure only after terminal settlement", async ({
  app,
  harness,
  db,
  ownerCaller,
  nativeSdk,
  fundingProvider,
}) => {
  const key = await ownerCaller.credentials.add({ provider: "claude-sub", key: "native-stream-funding-token", metadata: { auth: "oauthToken" } });
  const connection = await fundingConnection({
    ownerCaller,
    harness,
    task: "chat",
    providerId: "claude-sub",
    baseUrl: null,
    credentialId: key.id,
    cachedFacts: true,
  });
  const { chat } = await ownerCaller.chat.startChat({ characterIds: [], opening: "none" });
  const prefix = Promise.withResolvers<void>();
  const text: string[] = [];
  const request = toChatRequest({
    connection,
    chatId: chat.id,
    params: {},
    systemPrompt: { static: "Answer briefly.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "streamed-funding control" }] }],
    onDelta: (delta): void => {
      if (delta.kind === "text") {
        text.push(delta.text);
        prefix.resolve();
      }
    },
  });
  let settled = false;
  const before = nativeSdk.children.length;
  const call = app.runtime.executor.runChatTurn(request);
  const monitor = call.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await prefix.promise;
    expect(text.join("")).toBe("partial funding response");
    expect(settled).toBe(false);
    expect(nativeSdk.children).toHaveLength(before + 1);
    expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedAt).toBeNull();
    const child = nativeSdk.children.at(-1);
    if (child === undefined) {
      throw new Error("the native stream never reached its actual subprocess");
    }
    expect(child.kill("SIGUSR2")).toBe(true);
    await monitor;
    await expect(call).rejects.toBe(fundingProvider.errors[0]);
    expect(fundingProvider.errors[0]).toBeInstanceOf(ProviderError);
    expect(fundingProvider.errors[0]).toMatchObject({ kind: "auth_failed", apiErrorStatus: 401 });
    expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(1);
    expect(nativeSdk.children).toHaveLength(before + 1);
  } finally {
    for (const child of nativeSdk.children.slice(before)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
    }
  }
});
