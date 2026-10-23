// @subject packages/server/src/domain/chat/substrate/assemble-gather.ts
// @subject packages/server/src/domain/chat/memory/recall/recall.ts
// @subject packages/server/src/domain/search/verbs/digests.ts
// @subject packages/inference/src/roles/executor.ts

import { auditLogs } from "@orb/db";
import { ProviderError } from "@orb/inference";
import { seedRecallCorpus } from "@orb/testkit/node/corpus-seed.ts";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";
import { fundingConnection, test } from "./runtime-funding.fixtures.ts";

const FITTED_INTENT = { maxContextTokens: 2048, maxOutputTokens: 64 };

for (const failedRole of ["embed", "chat"] as const) {
  test(`a genuine scoped turn strikes only its ${failedRole} rejection`, async ({ app, harness, db, ownerCaller, fundingProvider }) => {
    const chatKey = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "recall-chat-key", metadata: { auth: "endpoint" } });
    const embedKey = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "recall-embed-key", metadata: { auth: "endpoint" } });
    const summaryKey = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "recall-summary-key", metadata: { auth: "endpoint" } });
    const chatConnection = await fundingConnection({ ownerCaller, harness, task: "chat", credentialId: chatKey.id });
    const embedConnection = await fundingConnection({ ownerCaller, harness, task: "embed", credentialId: embedKey.id });
    const summaryConnection = await fundingConnection({ ownerCaller, harness, task: "summarize", credentialId: summaryKey.id });
    let beforeRecall = 0;
    const seeded = await seedRecallCorpus(harness, {
      chatConnectionId: chatConnection.connectionId,
      embedConnectionId: embedConnection.connectionId,
      summarizeConnectionId: summaryConnection.connectionId,
      beforeRecall: () => {
        beforeRecall = fundingProvider.calls.length;
      },
    });
    const { chatId, first, recalled } = seeded;
    const principal = await harness.principalFor(harness.ownerId);
    expect(first.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(first.messages).toMatchObject([
      { role: "user", chatId, content: "Remember the ledger.", authorUserId: harness.ownerId },
      { role: "assistant", chatId, content: JSON.stringify({ answer: "funded" }), connectionId: chatConnection.connectionId },
    ]);
    const firstIds = first.messages.map((message) => message.id);
    expect((await ownerCaller.chat.listMessages({ chatId })).messages.slice(-4, -2).map((message) => message.id)).toEqual(firstIds);
    expect(first.messages.find((message) => message.role === "assistant")?.contextBoundaryMessageId).not.toBeNull();
    expect(seeded.jobs.map((job) => job.kind).sort()).toEqual(["databank-reindex", "index", "memory-backfill"]);
    expect(seeded.jobs.every((job) => job.status === "succeeded")).toBe(true);
    expect(seeded.memory.segments.length).toBeGreaterThan(0);
    expect(seeded.memory.digests.length).toBeGreaterThan(0);
    expect(seeded.traces.some((trace) => trace.queryEmbedded && trace.poolSize > 0)).toBe(true);
    expect(recalled.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(recalled.messages).toMatchObject([
      { role: "user", chatId, content: "Which remembered scene held the ledger?", authorUserId: harness.ownerId },
      { role: "assistant", chatId, content: JSON.stringify({ answer: "funded" }), connectionId: chatConnection.connectionId },
    ]);
    expect((await ownerCaller.chat.listMessages({ chatId })).messages.slice(-2).map((message) => message.id)).toEqual(
      recalled.messages.map((message) => message.id),
    );
    expect(recalled.messages.find((message) => message.role === "assistant")?.contextBoundaryMessageId).not.toBeNull();
    const queryPath = fundingProvider.calls[beforeRecall];
    expect(queryPath).toMatch(/\/embeddings$/u);
    if (queryPath === undefined) {
      throw new Error("the genuine successful recall never dialled its encoder");
    }
    expect(app.recallRecorder.recent({ chatId }).some((entry) => entry.trace.queryEmbedded && entry.trace.poolSize > 0)).toBe(true);
    expect(fundingProvider.calls.slice(beforeRecall, beforeRecall + 2)).toEqual([queryPath, queryPath]);
    const generationPath = fundingProvider.calls[beforeRecall + 2];
    expect(generationPath).toMatch(/\/chat\/completions$/u);
    if (generationPath === undefined) {
      throw new Error("the genuine successful scoped turn never dialled its generation");
    }
    fundingProvider.statusFor(failedRole === "embed" ? queryPath : generationPath, 401, failedRole === "embed" ? 1 : 0);
    const beforeFailure = fundingProvider.calls.length;
    let failure: Error | undefined;
    try {
      await app.services.chat.send({ principal, chatId, content: "Recall the ledger again.", intent: FITTED_INTENT });
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      failure = error;
    }
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ kind: "auth_failed", apiErrorStatus: 401 });
    const rejection = fundingProvider.errors.at(-1);
    if (rejection === undefined) {
      throw new Error("the scripted provider recorded no rejection");
    }
    // The provider's own message already names its task, so only the text a re-frame adds may name the failing role.
    expect(failedRole === "embed" ? failure?.cause : failure).toBe(rejection);
    expect(failure?.message.replace(rejection.message, "")).toMatch(failedRole === "embed" ? new RegExp(`\\b${failedRole}\\b`, "u") : /^$/u);
    expect(fundingProvider.calls.slice(beforeFailure)).toEqual(failedRole === "embed" ? [queryPath, queryPath] : [queryPath, queryPath, generationPath]);
    const keys = await ownerCaller.credentials.list();
    const rejectedKey = failedRole === "embed" ? embedKey : chatKey;
    const unusedKey = failedRole === "embed" ? chatKey : embedKey;
    expect(keys.find((key) => key.id === rejectedKey.id)?.revokedReason).toBe("auth_failed");
    for (const untouched of [unusedKey, summaryKey]) {
      expect(keys.find((key) => key.id === untouched.id)?.revokedAt).toBeNull();
      expect(
        await db
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.entityId, untouched.id), eq(auditLogs.action, "credential.markRevoked"))),
      ).toHaveLength(0);
    }
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, rejectedKey.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(1);
  });
}
