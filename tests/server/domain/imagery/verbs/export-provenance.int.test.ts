import type { PortableImageryCall } from "@orb/contracts/imagery";
import { responseCacheSchema } from "@orb/contracts/inference";
import type { PortableFile } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { assets, imageryGenerations, imageryImportCalls, ownerStats, userConnections } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createImageryPortability } from "@orb/server/domain/imagery";
import { bumpStatsCanonVersion, reconcileStats } from "@orb/server/domain/stats";
import { buildImageryCall, parseImageryCall } from "@orb/server/kit/serde/imagery";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { seedAsset } from "../../../../support/factories/asset.ts";
import { makeImageryCall } from "../../../../support/factories/imagery-call.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function service(db: Db): ReturnType<typeof createImageryPortability> {
  return createImageryPortability({
    db,
    newCallId: () => mintTypeId(ID_PREFIX.imageryCall),
    newGenerationId: () => mintTypeId(ID_PREFIX.imageryGeneration),
    bumpStatsCanonVersion,
  });
}
async function seedNative(db: Db, ownerId: UserId, call: PortableImageryCall): Promise<void> {
  for (const image of call.images) {
    await seedAsset(db, { id: image.assetId, ownerId, kind: "generated" });
    const e = call.execution;
    await db.insert(imageryGenerations).values({
      id: image.sourceGenerationId,
      assetId: image.assetId,
      callId: e.sourceCallId,
      mode: e.mode,
      prompt: e.prompt,
      negativePrompt: e.negativePrompt,
      model: e.model,
      provider: e.provider,
      connectionId: e.connectionId,
      costUsd: e.costUsd,
      edited: e.edited,
      createdAt: e.createdAt,
      ...e.usage,
    });
  }
}

test("all owned native history exports without gallery curation; foreign history stays home", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const foreign = await seedUser(db);
  const call = makeImageryCall();
  await seedNative(db, owner.id, call);
  await seedNative(db, foreign.id, makeImageryCall());
  const foreignFiles: PortableFile[] = [];
  for await (const file of service(db).exportAll(foreign.id)) {
    foreignFiles.push(file);
  }
  const foreignFile = foreignFiles[0];
  if (foreignFile === undefined) {
    throw new Error("foreign fixture export missing");
  }
  const beforeRefusal = await db.select().from(imageryGenerations);
  expect((await service(db).importFile(owner.id, foreignFile)).ok).toBe(false);
  expect(await db.select().from(imageryGenerations)).toEqual(beforeRefusal);
  const files: PortableFile[] = [];
  for await (const file of service(db).exportAll(owner.id)) {
    files.push(file);
  }
  expect(files).toHaveLength(1);
  const output = files[0];
  if (output === undefined) {
    throw new Error("export missing");
  }
  expect(output.bytes).toEqual(buildImageryCall(call));
  expect(parseImageryCall(output.bytes)).toMatchObject({ ok: true, value: { images: expect.arrayContaining(call.images) } });
});

test("native same-box import is a cost/cardinality fixedpoint; modified execution is additive", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const call = makeImageryCall();
  await seedNative(db, owner.id, call);
  const before = await db.select().from(imageryGenerations);
  const api = service(db);
  for await (const exported of api.exportAll(owner.id)) {
    expect(await api.importFile(owner.id, exported)).toMatchObject({ ok: true, created: false });
    expect(await api.importFile(owner.id, exported)).toMatchObject({ ok: true, created: false });
  }
  expect(await db.select().from(imageryGenerations)).toEqual(before);
  expect((await db.select().from(imageryImportCalls))[0]?.id).toBe(call.execution.sourceCallId);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.125);
  const modified = { ...call, execution: { ...call.execution, prompt: "An actually different history" } };
  expect(await api.importFile(owner.id, { filename: "changed.json", bytes: buildImageryCall(modified) })).toMatchObject({ ok: true, created: true });
  expect(await db.select().from(imageryGenerations)).toHaveLength(4);
  const additiveExports: PortableFile[] = [];
  for await (const output of api.exportAll(owner.id)) {
    additiveExports.push(output);
  }
  expect(additiveExports).toHaveLength(2);
  expect(new Set(additiveExports.map((output) => output.filename)).size).toBe(2);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.25);
});

test("legacy null-call rows export separately and rebuild known spend once per source row", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const original = makeImageryCall();
  const call = { ...original, execution: { ...original.execution, sourceCallId: null } };
  await seedNative(db, owner.id, call);
  const api = service(db);
  const files: PortableFile[] = [];
  for await (const exported of api.exportAll(owner.id)) {
    files.push(exported);
  }
  expect(files).toHaveLength(2);
  for (const file of files) {
    expect(await api.importFile(owner.id, file)).toMatchObject({ ok: true, created: false });
  }
  expect(await db.select().from(imageryGenerations)).toHaveLength(2);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.25);
});

test("native retained subset and later NULL-attribution output share one immutable priced execution", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const call = makeImageryCall();
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  call.execution.connectionId = connectionId;
  if (call.execution.provider === null) {
    throw new Error("fixture provider missing");
  }
  await db
    .insert(userConnections)
    .values({ id: connectionId, ownerId: owner.id, label: "Native connection", providerId: call.execution.provider, model: call.execution.model });
  await seedNative(db, owner.id, call);
  const second = call.images[1];
  if (second === undefined) {
    throw new Error("fixture second output missing");
  }
  await db.delete(imageryGenerations).where(eq(imageryGenerations.id, second.sourceGenerationId));
  const api = service(db);
  const retained: PortableFile[] = [];
  for await (const output of api.exportAll(owner.id)) {
    retained.push(output);
  }
  const partial = retained[0];
  if (partial === undefined) {
    throw new Error("retained output missing");
  }
  expect(await api.importFile(owner.id, partial)).toMatchObject({ ok: true, created: false });
  expect(await api.importFile(owner.id, { filename: "full.json", bytes: buildImageryCall(call) })).toMatchObject({ ok: true, created: true });
  const rows = await db.select().from(imageryGenerations);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.callId))).toEqual(new Set([call.execution.sourceCallId]));
  expect(rows.map((row) => row.connectionId).sort()).toEqual([null, connectionId].sort());
  expect(
    rows.every(
      (row) =>
        row.model === call.execution.model &&
        row.provider === call.execution.provider &&
        row.costUsd === call.execution.costUsd &&
        row.createdAt === call.execution.createdAt,
    ),
  ).toBe(true);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.125);
});

test("a full native backup directly restores a missing output without duplicating its surviving sibling", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const call = makeImageryCall();
  await seedNative(db, owner.id, call);
  const first = call.images[0];
  const second = call.images[1];
  if (first === undefined || second === undefined) {
    throw new Error("fixture outputs missing");
  }
  const api = service(db);
  const files: PortableFile[] = [];
  for await (const file of api.exportAll(owner.id)) {
    files.push(file);
  }
  expect(files).toHaveLength(1);
  const fullBackup = files[0];
  if (fullBackup === undefined) {
    throw new Error("native backup missing");
  }
  const retained = (await db.select().from(imageryGenerations).where(eq(imageryGenerations.id, first.sourceGenerationId)))[0];
  expect(retained).toBeDefined();
  await db.delete(imageryGenerations).where(eq(imageryGenerations.id, second.sourceGenerationId));
  expect(await db.select().from(assets).where(eq(assets.ownerId, owner.id))).toHaveLength(2);
  expect(await db.select().from(imageryImportCalls)).toEqual([]);

  expect(await api.importFile(owner.id, fullBackup)).toMatchObject({ ok: true, created: true });
  const restored = await db.select().from(imageryGenerations).orderBy(imageryGenerations.id);
  expect(restored).toHaveLength(2);
  expect(restored.filter((row) => row.assetId === first.assetId)).toEqual([retained]);
  expect(restored.filter((row) => row.assetId === second.assetId)).toMatchObject([
    { importSource: { sourceGenerationId: second.sourceGenerationId }, callId: call.execution.sourceCallId },
  ]);
  expect(new Set(restored.map((row) => row.callId))).toEqual(new Set([call.execution.sourceCallId]));
  expect((await db.select().from(imageryImportCalls))[0]?.id).toBe(call.execution.sourceCallId);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.125);

  expect(await api.importFile(owner.id, fullBackup)).toMatchObject({ ok: true, created: false });
  expect(await db.select().from(imageryGenerations).orderBy(imageryGenerations.id)).toEqual(restored);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.125);
});

test("stored response-cache facts survive owned export and native restore while changed facts stay additive", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const call = makeImageryCall();
  const first = call.images[0];
  const second = call.images[1];
  if (first === undefined || second === undefined) {
    throw new Error("fixture outputs missing");
  }
  call.execution.usage.responseCache = responseCacheSchema.parse({
    status: "hit",
    ageSeconds: 15,
    ttlSeconds: 300,
    sourceGenerationId: first.sourceGenerationId,
  });
  await seedNative(db, owner.id, call);
  const before = await db.select().from(imageryGenerations).orderBy(imageryGenerations.id);
  const api = service(db);
  const files: PortableFile[] = [];
  for await (const file of api.exportAll(owner.id)) {
    files.push(file);
  }
  const full = files[0];
  if (full === undefined) {
    throw new Error("native cache history missing");
  }
  expect(parseImageryCall(full.bytes)).toEqual({ ok: true, value: call });
  expect(await api.importFile(owner.id, full)).toMatchObject({ ok: true, created: false });
  expect(await db.select().from(imageryGenerations).orderBy(imageryGenerations.id)).toEqual(before);
  await db.delete(imageryGenerations).where(eq(imageryGenerations.id, second.sourceGenerationId));
  expect(await api.importFile(owner.id, full)).toMatchObject({ ok: true, created: true });
  const restored = await db.select().from(imageryGenerations).orderBy(imageryGenerations.id);
  expect(restored).toHaveLength(2);
  expect(restored.find((row) => row.id === first.sourceGenerationId)).toEqual(before.find((row) => row.id === first.sourceGenerationId));
  expect(restored.every((row) => row.responseCache?.sourceGenerationId === String(first.sourceGenerationId) && row.responseCache.status === "hit")).toBe(true);
  expect(new Set(restored.map((row) => row.callId))).toEqual(new Set([call.execution.sourceCallId]));
  expect(await api.importFile(owner.id, full)).toMatchObject({ ok: true, created: false });
  expect(await db.select().from(imageryGenerations).orderBy(imageryGenerations.id)).toEqual(restored);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.125);

  const changed = {
    ...call,
    execution: {
      ...call.execution,
      usage: { ...call.execution.usage, responseCache: { status: "miss" as const, ageSeconds: null, ttlSeconds: null, sourceGenerationId: null } },
    },
  };
  expect(await api.importFile(owner.id, { filename: "changed-cache.json", bytes: buildImageryCall(changed) })).toMatchObject({ ok: true, created: true });
  const additive = await db.select().from(imageryGenerations);
  expect(additive).toHaveLength(4);
  expect(new Set(additive.map((row) => row.callId)).size).toBe(2);
  expect(additive.filter((row) => row.responseCache?.status === "hit")).toHaveLength(2);
  expect(additive.filter((row) => row.responseCache?.status === "miss")).toHaveLength(2);
  await reconcileStats(db, { ownerId: owner.id, now: () => 1_750_000_001_000 });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner.id)))[0]?.costUsd).toBe(0.25);
});
