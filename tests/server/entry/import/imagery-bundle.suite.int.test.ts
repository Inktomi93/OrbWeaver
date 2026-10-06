// Actual HTTP export/upload, composed registry, real import workload, owned CAS and stats rebuild.
import "../../../support/composed-real.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PortableFile } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, imageryGenerations, modelStats, ownerStats } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import { loadWorkload, runWorkload } from "@orb/server/domain/workloads";
import { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "@orb/server/entry/compose";
import type { PrincipalEnv } from "@orb/server/entry/http";
import { registerExport, registerImportBundle } from "@orb/server/entry/http";
import { buildImageryCall, parseImageryCall } from "@orb/server/kit/serde/imagery";
import { subscribeUserEvents } from "@orb/server/transport/trpc";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { onTestFinished } from "vitest";
import { z } from "zod";
import { freshDb } from "../../../support/db.ts";
import { seedCharacter } from "../../../support/factories/character.ts";
import { makeImageryCall } from "../../../support/factories/imagery-call.ts";
import { principal } from "../../../support/factories/principal.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { loadRunnableWorkload, makeRunnerDeps } from "../../domain/workloads/_support.ts";

async function imageSpend(db: Db, ownerId: UserId): Promise<number | undefined> {
  return (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]?.costUsd;
}

test("a complete library bundle restores uncurated image calls and rebuilds spend exactly once", async ({
  app,
  db,
  clock,
  importStagingDir,
  providerFetch,
}) => {
  const source = await seedUser(db);
  const foreign = await seedUser(db);
  const owner = principal(source.id, { handle: source.handle, via: "header" });
  const call = makeImageryCall();
  const character = await seedCharacter(db, { ownerId: source.id, id: mintTypeId(ID_PREFIX.character), name: "Hero", handle: castId("hero") });
  const chatId = mintTypeId(ID_PREFIX.chat);
  await db.insert(chats).values({ id: chatId, title: "Source room", createdAt: clock.now(), updatedAt: clock.now() });
  await db.insert(chatParticipants).values([
    { id: mintTypeId(ID_PREFIX.chatParticipant), chatId, kind: "human", role: "host", userId: source.id, joinSeq: 0, joinedAt: clock.now() },
    { id: mintTypeId(ID_PREFIX.chatParticipant), chatId, kind: "character", role: "member", characterId: character.id, joinSeq: 0, joinedAt: clock.now() },
  ]);
  const outputBytes = [new TextEncoder().encode("first uncurated generated image"), new TextEncoder().encode("second uncurated generated image")];
  const assetIds: AssetId[] = [];
  for (const [index, bytes] of outputBytes.entries()) {
    const asset = await app.services.assets.store({ principal: owner, bytes, kind: "generated", mime: "image/png" });
    assetIds.push(asset.assetId);
    const sourceImage = call.images[index];
    if (sourceImage === undefined) {
      throw new Error("fixture output identity missing");
    }
    await db.insert(imageryGenerations).values({
      id: sourceImage.sourceGenerationId,
      assetId: asset.assetId,
      callId: call.execution.sourceCallId,
      mode: call.execution.mode,
      subjectCharacterId: character.id,
      chatId,
      prompt: call.execution.prompt,
      negativePrompt: call.execution.negativePrompt,
      model: call.execution.model,
      provider: call.execution.provider,
      costUsd: call.execution.costUsd,
      edited: call.execution.edited,
      createdAt: call.execution.createdAt,
      ...call.execution.usage,
    });
  }
  const foreignBlob = await app.services.assets.store({
    principal: principal(foreign.id),
    bytes: new TextEncoder().encode("foreign image must stay home"),
    kind: "generated",
    mime: "image/png",
  });
  await db.insert(imageryGenerations).values({
    id: mintTypeId(ID_PREFIX.imageryGeneration),
    assetId: foreignBlob.assetId,
    mode: "free",
    prompt: "FOREIGN HISTORY",
    model: call.execution.model,
  });
  const sourceWeb = new Hono<PrincipalEnv>();
  sourceWeb.use("*", async (context, next) => {
    context.set("principal", owner);
    await next();
  });
  registerExport(sourceWeb, { export: app.exportService, registry: app.portability });
  const response = await sourceWeb.request("/api/export/library");
  expect(response.status).toBe(200);
  const archive = new Uint8Array(await response.arrayBuffer());

  const restoredDb = await freshDb();
  const targetUser = await seedUser(restoredDb);
  const target = principal(targetUser.id, { handle: targetUser.handle, via: "header" });
  const casDir = await mkdtemp(join(tmpdir(), "orb-imagery-restore-cas-"));
  const variantDir = await mkdtemp(join(tmpdir(), "orb-imagery-restore-var-"));
  onTestFinished(async () => {
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
    providerSeams: { sdkFetch: providerFetch },
  });
  const targetWeb = new Hono<PrincipalEnv>();
  targetWeb.use("*", async (context, next) => {
    context.set("principal", target);
    await next();
  });
  registerImportBundle(targetWeb, { workloads: restored.services.workloads, stagingDir: importStagingDir });
  const runImport = async (bytes: Uint8Array): Promise<void> => {
    const uploaded = await targetWeb.request("/api/import/bundle", { method: "POST", body: new Uint8Array(bytes) });
    expect(uploaded.status).toBe(202);
    const started = z.object({ workloadId: typeIdSchema(ID_PREFIX.workload) }).parse(await uploaded.json());
    const row = await loadRunnableWorkload(restoredDb, restored.workloadContributions, started.workloadId);
    await runWorkload(makeRunnerDeps(restoredDb, restored.workloadContributions), row, new AbortController().signal);
    const done = await loadWorkload(restoredDb, restored.workloadContributions, started.workloadId);
    expect(done?.status).toBe("succeeded");
    expect(done?.result).toMatchObject({ failed: 0 });
  };
  await runImport(archive);
  const rows = await restoredDb.select().from(imageryGenerations);
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.id !== call.images[0]?.sourceGenerationId && row.callId !== call.execution.sourceCallId && row.chatId === null)).toBe(true);
  const freshHero = (await restoredDb.select().from(characters).where(eq(characters.ownerId, targetUser.id)))[0];
  expect(rows.every((row) => row.subjectCharacterId === freshHero?.id)).toBe(true);
  expect(rows.every((row) => row.tokenDetails?.output?.[0]?.tokens === 200 && row.tokensOut === 300 && row.cacheWriteTokens === null)).toBe(true);
  expect(await imageSpend(restoredDb, targetUser.id)).toBe(0.125);
  expect((await restoredDb.select().from(modelStats).where(eq(modelStats.ownerId, targetUser.id)))[0]).toMatchObject({
    model: call.execution.model,
    provider: call.execution.provider,
    generations: 2,
  });
  for (const [index, id] of assetIds.entries()) {
    const bytes = await restored.assets.loadAssetBytes(id);
    expect(bytes).not.toBeNull();
    expect([...(bytes ?? [])]).toEqual([...(outputBytes[index] ?? [])]);
  }
  expect(await restored.assets.loadAssetBytes(foreignBlob.assetId)).toBeNull();
  await runImport(archive);
  expect(await restoredDb.select().from(imageryGenerations)).toHaveLength(2);
  expect(await imageSpend(restoredDb, targetUser.id)).toBe(0.125);

  // The actual completion event also fires when no character/chat files were requested or changed.
  const imageryOnly = new Uint8Array(await (await sourceWeb.request("/api/export/library?kinds=imagery,assets")).arrayBuffer());
  const abort = new AbortController();
  const events = subscribeUserEvents(targetUser.id, abort.signal);
  const completion = (async (): Promise<void> => {
    for await (const event of events) {
      if (event.type === "charactersChanged") {
        return;
      }
    }
    throw new Error("Import completion event was not delivered");
  })();
  try {
    await runImport(imageryOnly);
    await completion;
    expect(await restoredDb.select().from(imageryGenerations)).toHaveLength(2);
    expect(await imageSpend(restoredDb, targetUser.id)).toBe(0.125);
  } finally {
    abort.abort();
  }

  const imagery = app.portability.find((entity) => entity.kind === "imagery");
  if (imagery === undefined) {
    throw new Error("Composed imagery descriptor missing");
  }
  const sourceFiles: PortableFile[] = [];
  for await (const file of imagery.exportAll(source.id)) {
    sourceFiles.push(file);
  }
  const firstHistory = sourceFiles[0];
  if (firstHistory === undefined) {
    throw new Error("Source execution history missing");
  }
  const parsed = parseImageryCall(firstHistory.bytes);
  if (!parsed.ok) {
    throw new Error(parsed.reason);
  }
  const modified = { ...parsed.value, execution: { ...parsed.value.execution, prompt: "Changed historical prompt" } };
  expect(await imagery.importFile(source.id, { filename: "modified.json", bytes: buildImageryCall(modified) })).toMatchObject({ ok: true, created: true });
  const additiveArchive = new Uint8Array(await (await sourceWeb.request("/api/export/library?kinds=imagery,assets")).arrayBuffer());
  await runImport(additiveArchive);
  const additiveRows = await restoredDb.select().from(imageryGenerations);
  expect(additiveRows).toHaveLength(4);
  expect(new Set(additiveRows.map((row) => row.callId)).size).toBe(2);
  expect(new Set(additiveRows.map((row) => row.prompt))).toEqual(new Set([call.execution.prompt, "Changed historical prompt"]));
  expect(await imageSpend(restoredDb, targetUser.id)).toBe(0.25);
  await runImport(additiveArchive);
  expect(await restoredDb.select().from(imageryGenerations)).toHaveLength(4);
  expect(await imageSpend(restoredDb, targetUser.id)).toBe(0.25);
});
