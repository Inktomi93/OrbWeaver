// Compaction turns at each phase, a late native SDK auth failure and a native funding turn record their
// compaction_spend, credential strike audit_logs and SDK session-lineage rows only after terminal settlement.
// @subject packages/inference/src/roles/executor.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// @subject packages/server/src/domain/chat/verbs/quiet-generate.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { auditLogs, compactionSpend } from "@orb/db";
import { ProviderError, toChatRequest } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { Fixtures } from "@orb/testkit/node";
import { expect } from "@orb/testkit/node";
import { captureSdkSessionRows } from "@orb/testkit/node/rows";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { fundingConnection, fundingRoom, test } from "../verbs/runtime-funding.fixtures.ts";

const GENERATION_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64, compaction: { mode: "managed", verbatimTail: 8 } } as const;

const PHASES = ["pre", "post"] as const;
type SendOutcome = Awaited<ReturnType<Fixtures["app"]["services"]["chat"]["send"]>>;
async function settleRefusedTurn(call: Promise<SendOutcome>): Promise<SendOutcome | null> {
  await expect(call).rejects.toBeInstanceOf(DomainNoCredentialError);
  return null;
}
async function settleCommittedTurn(call: Promise<SendOutcome>): Promise<SendOutcome | null> {
  const committed = await call;
  expect(committed.aborted).toBe(false);
  expect(committed.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(committed.messages.find((message) => message.role === "assistant")?.content).toBe("native funding reply");
  return committed;
}
const SETTLEMENT: Record<(typeof PHASES)[number], (call: Promise<SendOutcome>) => Promise<SendOutcome | null>> = {
  pre: settleRefusedTurn,
  post: settleCommittedTurn,
};
const WARNINGS: Record<(typeof PHASES)[number], string> = {
  pre: "chat: pre-turn managed compaction failed (proceeding)",
  post: "chat: managed compaction failed",
};

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
    const warn = vi.spyOn(harness.logger, "warn");
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

test("a native funding turn captures only its genuine canon-seeded session lineage", async ({ app, harness, db, ownerCaller, nativeSdk }) => {
  const key = await ownerCaller.credentials.add({ provider: "claude-sub", key: "corpus-native-sdk-token", metadata: { auth: "oauthToken" } });
  const connection = await fundingConnection({
    ownerCaller,
    harness,
    task: "chat",
    providerId: "claude-sub",
    credentialId: key.id,
    baseUrl: null,
    cachedFacts: true,
  });
  await ownerCaller.connection.setBinding({ task: "chat", connectionId: connection.connectionId });
  const preset = await ownerCaller.preset.create({ name: "SDK lineage witness", kind: "custom" });
  await ownerCaller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const character = await ownerCaller.character.create({
    input: createCharacterSchema.parse({
      handle: "sdk-lineage-witness",
      name: "The native archivist",
      description: "An archivist of completed SDK turns.",
      greetings: [{ text: "The archivist opens the orbital ledger." }],
    }),
  });
  const started = await ownerCaller.chat.startChat({ characterIds: [character.id], opening: "first-message" });
  const chatId = started.chat.id;
  expect(started.opening?.messages.map((message) => [message.role, message.characterId, message.content])).toEqual([
    ["assistant", character.id, "The archivist opens the orbital ledger."],
  ]);
  expect(await captureSdkSessionRows(db, chatId, connection.connectionId)).toEqual([]);
  const principal = await harness.principalFor(harness.ownerId);
  const outcome = await app.services.chat.send({
    principal,
    chatId,
    content: "post-compaction lineage witness",
    intent: { maxContextTokens: 32_000, maxOutputTokens: 64 },
  });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual(["native funding reply"]);
  const captured = await captureSdkSessionRows(db, chatId, connection.connectionId);
  expect(captured.length).toBeGreaterThan(0);
  expect(
    captured.every((row) => row.chatId === chatId && row.connectionId === connection.connectionId && row.canonHash !== "" && row.seededThroughSeq > 0),
  ).toBe(true);
  expect(captured.filter((row) => row.isPrimary)).toHaveLength(1);
  const otherChatId = (await ownerCaller.chat.startChat({ characterIds: [character.id], opening: "none" })).chat.id;
  expect(await captureSdkSessionRows(db, otherChatId, connection.connectionId)).toEqual([]);
  const fresh = await app.services.chat.send({
    principal,
    chatId: otherChatId,
    content: "post-compaction fresh empty-seed witness",
    intent: { maxContextTokens: 32_000, maxOutputTokens: 64 },
  });
  expect(fresh.aborted).toBe(false);
  expect(fresh.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual(["native funding reply"]);
  expect(await captureSdkSessionRows(db, otherChatId, connection.connectionId)).toEqual([]);
  expect(await captureSdkSessionRows(db, chatId, connection.connectionId)).toEqual(captured);
  expect(nativeSdk.children.every((child) => child.exitCode === 0)).toBe(true);
});
