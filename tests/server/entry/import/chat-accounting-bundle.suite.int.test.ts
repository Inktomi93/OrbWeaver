// Native accounting crosses actual HTTP/library export, upload and the composed import workload.
import "../../../support/composed-real.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generationUsageLegSchema } from "@orb/contracts/inference";
import { chatGenerationObservations, chatParticipants, chats, closeDb, messages, messageVariants, ownerStats } from "@orb/db";
import { castId, ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import { reconcileStats } from "@orb/server/domain/stats";
import { loadWorkload, runWorkload } from "@orb/server/domain/workloads";
import { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "@orb/server/entry/compose";
import type { PrincipalEnv } from "@orb/server/entry/http";
import { registerExport, registerImportBundle } from "@orb/server/entry/http";
import { parseChatBundleFile } from "@orb/server/kit/serde/chat-bundle";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { onTestFinished } from "vitest";
import { z } from "zod";
import { freshDb } from "../../../support/db.ts";
import { seedCharacter } from "../../../support/factories/character.ts";
import { makeGenerationUsage } from "../../../support/factories/generation-usage.ts";
import { principal } from "../../../support/factories/principal.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { loadRunnableWorkload, makeRunnerDeps } from "../../domain/workloads/_support.ts";

test("two-box native workload preserves retained legs and pending positional facts, remints private parents and settles once", async ({
  app,
  db,
  clock,
  importStagingDir,
}) => {
  const source = await seedUser(db);
  const originalFunder = await seedUser(db);
  const owner = principal(source.id, { handle: source.handle, via: "header" });
  const character = await seedCharacter(db, { ownerId: source.id, id: mintTypeId(ID_PREFIX.character), name: "Hero", handle: castId("hero") });
  const chatId = mintTypeId(ID_PREFIX.chat);
  const messageId = mintTypeId(ID_PREFIX.message);
  const variantId = mintTypeId(ID_PREFIX.messageVariant);
  const turnId = mintTypeId(ID_PREFIX.chatTurn);
  const standaloneTurnId = mintTypeId(ID_PREFIX.chatTurn);
  const leg = generationUsageLegSchema.parse({
    ...makeGenerationUsage(0.25, { tokensIn: 10, tokensOut: 20, servedModel: "served-generation" }),
    model: "gemini-3.1-pro-preview",
    provider: "google",
    wire: "google-generative-ai",
    observedAt: clock.now(),
    modelCalls: 1,
    contextWindow: null,
    maxOutputTokens: 2048,
    durationApiMs: 1,
    ttftMs: null,
    finishReason: "stop",
    stopReason: "STOP",
    terminalReason: null,
    generationId: null,
  });
  const pendingLeg = generationUsageLegSchema.parse({
    ...leg,
    ...makeGenerationUsage(0.125, { tokensIn: 70, tokensOut: 2048, cacheReadTokens: null, cacheWriteTokens: 0 }),
    observedAt: clock.now() + 1,
    finishReason: "length",
    stopReason: "MAX_TOKENS",
  });
  const unknownLeg = generationUsageLegSchema.parse({ ...leg, ...makeGenerationUsage(null), observedAt: clock.now() + 2 });
  await db.insert(chats).values({ id: chatId, title: "Retained accounting", startedAt: clock.now(), createdAt: clock.now(), updatedAt: clock.now() });
  await db.insert(chatParticipants).values([
    { id: mintTypeId(ID_PREFIX.chatParticipant), chatId, kind: "human", role: "host", userId: source.id, joinSeq: 0, joinedAt: clock.now() },
    { id: mintTypeId(ID_PREFIX.chatParticipant), chatId, kind: "character", role: "member", characterId: character.id, joinSeq: 0, joinedAt: clock.now() },
  ]);
  await db.insert(messages).values({ id: messageId, chatId, seq: 1, role: "assistant", characterId: character.id, createdAt: clock.now() });
  await db.insert(messageVariants).values({
    id: variantId,
    messageId,
    idx: 0,
    content: "They reach the tower.",
    ...leg,
    tokenProvenance: "measured",
    metadata: { usageLegs: [leg] },
    createdAt: clock.now(),
  });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
  await db.insert(chatGenerationObservations).values([
    {
      ...pendingLeg,
      chatId,
      turnId,
      ordinal: 0,
      sourceMessageId: messageId,
      sourceVariantId: variantId,
      funderUserId: originalFunder.id,
      connectionId: null,
      connectionAttributionProvenance: "unrecorded",
    },
    {
      ...unknownLeg,
      chatId,
      turnId: standaloneTurnId,
      ordinal: 0,
      sourceMessageId: null,
      sourceVariantId: null,
      funderUserId: originalFunder.id,
      connectionId: null,
      connectionAttributionProvenance: "unrecorded",
    },
  ]);
  const sourceWeb = new Hono<PrincipalEnv>();
  sourceWeb.use("*", async (context, next) => {
    context.set("principal", owner);
    await next();
  });
  registerExport(sourceWeb, { export: app.exportService, registry: app.portability });
  const nativeResponse = await sourceWeb.request(`/api/export/chat/${chatId}?format=orb`);
  expect(nativeResponse.status).toBe(200);
  const native = parseChatBundleFile(new Uint8Array(await nativeResponse.arrayBuffer()));
  expect(native.ok).toBe(true);
  if (!native.ok) {
    throw new Error(native.reason);
  }
  const pending = native.value.pendingGenerationObservations;
  expect(pending).toHaveLength(2);
  const serialized = JSON.stringify(pending);
  for (const id of [source.id, originalFunder.id, chatId, messageId, variantId, turnId, standaloneTurnId]) {
    expect(serialized).not.toContain(id);
  }
  const archiveResponse = await sourceWeb.request("/api/export/library?kinds=character,chat");
  expect(archiveResponse.status).toBe(200);
  const archive = new Uint8Array(await archiveResponse.arrayBuffer());
  const restoredDb = await freshDb();
  const targetUser = await seedUser(restoredDb);
  const target = principal(targetUser.id, { handle: targetUser.handle, via: "header" });
  const casDir = await mkdtemp(join(tmpdir(), "orb-chat-accounting-cas-"));
  const variantDir = await mkdtemp(join(tmpdir(), "orb-chat-accounting-var-"));
  onTestFinished(async () => {
    closeDb(restoredDb);
    await rm(casDir, { recursive: true, force: true });
    await rm(variantDir, { recursive: true, force: true });
  });
  const restored = await createServices({
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    db: restoredDb,
    now: () => clock.now(),
    ownerId: targetUser.id,
    secretBoxKey: null,
    casDir,
    variantDir,
    importStagingDir,
    sessionSecret: "test-session-secret-at-least-32-chars",
    providerSeams: { sdkFetch: () => Promise.reject(new Error("native restore must not purchase provider work")) },
  });
  const targetWeb = new Hono<PrincipalEnv>();
  targetWeb.use("*", async (context, next) => {
    context.set("principal", target);
    await next();
  });
  registerImportBundle(targetWeb, { workloads: restored.services.workloads, stagingDir: importStagingDir });
  registerExport(targetWeb, { export: restored.exportService, registry: restored.portability });
  const runImport = async (): Promise<void> => {
    const uploaded = await targetWeb.request("/api/import/bundle", { method: "POST", body: new Uint8Array(archive) });
    expect(uploaded.status).toBe(202);
    const started = z.object({ workloadId: typeIdSchema(ID_PREFIX.workload) }).parse(await uploaded.json());
    const row = await loadRunnableWorkload(restoredDb, restored.workloadContributions, started.workloadId);
    await runWorkload(makeRunnerDeps(restoredDb, restored.workloadContributions), row, new AbortController().signal);
    const done = await loadWorkload(restoredDb, restored.workloadContributions, started.workloadId);
    expect(done?.status).toBe("succeeded");
    expect(done?.result).toMatchObject({ failed: 0 });
  };
  await runImport();
  const restoredChats = await restoredDb.select().from(chats);
  expect(restoredChats).toHaveLength(1);
  const restoredChat = restoredChats[0];
  if (restoredChat === undefined) {
    throw new Error("Restored room missing");
  }
  expect(restoredChat.id).not.toBe(chatId);
  const observations = await restoredDb.select().from(chatGenerationObservations);
  expect(observations).toHaveLength(2);
  expect(
    observations.every(
      (row) =>
        row.chatId === restoredChat.id &&
        row.funderUserId === targetUser.id &&
        row.connectionId === null &&
        row.turnId !== turnId &&
        row.turnId !== standaloneTurnId,
    ),
  ).toBe(true);
  const restoredVariants = await restoredDb.select().from(messageVariants);
  expect(restoredVariants).toHaveLength(1);
  expect(restoredVariants[0]?.metadata?.usageLegs).toEqual([leg]);
  expect(restoredVariants[0]?.id).not.toBe(variantId);
  const live = await restoredDb.select().from(ownerStats).where(eq(ownerStats.ownerId, targetUser.id));
  expect(live[0]).toMatchObject({ costUsd: 0.375, costSamples: 2, tokensIn: 80, tokensOut: 2068, assistantTurns: 1 });
  await reconcileStats(restoredDb, { ownerId: targetUser.id, now: () => clock.now() });
  expect(await restoredDb.select().from(ownerStats).where(eq(ownerStats.ownerId, targetUser.id))).toEqual(live);
  const reexported = await targetWeb.request(`/api/export/chat/${restoredChat.id}?format=orb`);
  expect(reexported.status).toBe(200);
  const reimported = parseChatBundleFile(new Uint8Array(await reexported.arrayBuffer()));
  expect(reimported.ok).toBe(true);
  if (!reimported.ok) {
    throw new Error(reimported.reason);
  }
  expect(reimported.value.pendingGenerationObservations).toEqual(pending);
  await runImport();
  expect(await restoredDb.select().from(chatGenerationObservations)).toEqual(observations);
  expect(await restoredDb.select().from(messageVariants)).toEqual(restoredVariants);
  expect(await restoredDb.select().from(ownerStats).where(eq(ownerStats.ownerId, targetUser.id))).toEqual(live);
});
