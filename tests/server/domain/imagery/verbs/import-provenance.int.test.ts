// Real persistence and ownership, including overlapping retained cohorts and identical output bytes.
import type { PortableImageryCall } from "@orb/contracts/imagery";
import { RESPONSE_CACHE_STATUSES, responseCacheSchema } from "@orb/contracts/inference";
import type { PortableFile } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import { chatParticipants, chats, imageryGenerations, imageryImportCalls, modelStats, ownerStats, statsCanonVersions, userConnections, users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createImageryPortability } from "@orb/server/domain/imagery";
import { bumpStatsCanonVersion, reconcileStats } from "@orb/server/domain/stats";
import { buildImageryCall } from "@orb/server/kit/serde/imagery";
import { eq } from "drizzle-orm";
import { readProvenanceByAsset } from "../../../../../packages/server/src/domain/imagery/persistence/queries.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { seedAsset } from "../../../../support/factories/asset.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
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
function file(call: PortableImageryCall): PortableFile {
  return { filename: "call.json", bytes: buildImageryCall(call) };
}
async function ownAssets(db: Db, ownerId: UserId, call: PortableImageryCall): Promise<void> {
  const ids = [...new Set(call.images.map((image) => image.assetId))];
  for (const id of ids) {
    await seedAsset(db, { id, ownerId, kind: "generated" });
  }
}
async function spend(db: Db, ownerId: UserId): Promise<number | undefined> {
  await reconcileStats(db, { ownerId, now: () => 1_750_000_001_000 });
  return (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]?.costUsd;
}

test("partial/full overlap preserves one call, two duplicate-byte output rows, edits and fixedpoint", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const call = makeImageryCall();
  const first = call.images[0];
  const second = call.images[1];
  if (first === undefined || second === undefined) {
    throw new Error("fixture outputs missing");
  }
  const duplicateBytes = { ...call, images: [first, { ...second, assetId: first.assetId }] };
  await ownAssets(db, owner.id, duplicateBytes);
  const api = service(db);
  expect(await api.importFile(owner.id, file({ ...duplicateBytes, images: [first] }))).toMatchObject({ ok: true, created: true });
  expect(await spend(db, owner.id)).toBe(0.125);
  const before = await db.select().from(imageryGenerations);
  expect(await api.importFile(owner.id, file(duplicateBytes))).toMatchObject({ ok: true, created: true });
  const after = await db.select().from(imageryGenerations);
  expect(after).toHaveLength(2);
  expect(after.find((row) => row.id === before[0]?.id)).toEqual(before[0]);
  expect(new Set(after.map((row) => row.callId)).size).toBe(1);
  expect(after.every((row) => row.id !== first.sourceGenerationId && row.id !== second.sourceGenerationId)).toBe(true);
  expect(await spend(db, owner.id)).toBe(0.125);
  expect(await api.importFile(owner.id, file({ ...duplicateBytes, images: [first] }))).toMatchObject({ ok: true, created: false });
  const exported: PortableFile[] = [];
  for await (const output of api.exportAll(owner.id)) {
    exported.push(output);
  }
  expect(exported).toHaveLength(1);
  const restored = exported[0];
  if (restored === undefined) {
    throw new Error("restored call missing");
  }
  expect(restored.bytes).toEqual(buildImageryCall(duplicateBytes));
  expect(await api.importFile(owner.id, restored)).toMatchObject({ ok: true, created: false });
  expect(await db.select().from(imageryGenerations)).toHaveLength(2);
  expect(await spend(db, owner.id)).toBe(0.125);
  expect((await db.select().from(modelStats).where(eq(modelStats.ownerId, owner.id)))[0]?.generations).toBe(2);
});

test("disjoint concurrent subsets use the same owned winning claim and one cost group", async () => {
  const held = await freshHeldDb();
  const owner = await seedUser(held.db);
  const call = makeImageryCall();
  await ownAssets(held.db, owner.id, call);
  const api = service(held.db);
  const gate = held.hold(/insert into "imagery_import_calls"/, 2);
  const pending = call.images.map((image) => api.importFile(owner.id, file({ ...call, images: [image] })));
  await gate.reached;
  gate.release();
  expect(await Promise.all(pending)).toEqual([
    { ok: true, created: true, notes: [] },
    { ok: true, created: true, notes: [] },
  ]);
  const rows = await held.db.select().from(imageryGenerations);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.callId)).size).toBe(1);
  expect(await held.db.select().from(imageryImportCalls)).toHaveLength(1);
  expect(await spend(held.db, owner.id)).toBe(0.125);
});

test("a foreign or missing sibling refuses the entire group without an orphan claim", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const foreign = await seedUser(db);
  const call = makeImageryCall();
  const first = call.images[0];
  const second = call.images[1];
  if (first === undefined || second === undefined) {
    throw new Error("fixture outputs missing");
  }
  await seedAsset(db, { id: first.assetId, ownerId: owner.id });
  const api = service(db);
  expect((await api.importFile(owner.id, file(call))).ok).toBe(false);
  await seedAsset(db, { id: second.assetId, ownerId: foreign.id });
  expect((await api.importFile(owner.id, file(call))).ok).toBe(false);
  expect(await db.select().from(imageryImportCalls)).toEqual([]);
  expect(await db.select().from(imageryGenerations)).toEqual([]);
});

test("subjects resolve only owned handles; carried chat and connection ids never become authority", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const foreign = await seedUser(db);
  const subject = await seedCharacter(db, { ownerId: owner.id, handle: castId("hero") });
  await seedCharacter(db, { ownerId: foreign.id, handle: castId("foreign-only") });
  const call = makeImageryCall();
  call.execution.subjectCharacterHandle = "hero";
  call.execution.chatId = mintTypeId(ID_PREFIX.chat);
  call.execution.connectionId = mintTypeId(ID_PREFIX.userConnection);
  if (call.execution.provider === null) {
    throw new Error("fixture provider missing");
  }
  await db.insert(chats).values({ id: call.execution.chatId, title: "Foreign room" });
  await db
    .insert(chatParticipants)
    .values({ id: mintTypeId(ID_PREFIX.chatParticipant), chatId: call.execution.chatId, kind: "human", role: "host", userId: foreign.id, joinSeq: 0 });
  await db.insert(userConnections).values({
    id: call.execution.connectionId,
    ownerId: foreign.id,
    label: "Foreign connection",
    providerId: call.execution.provider,
    model: call.execution.model,
  });
  await ownAssets(db, owner.id, call);
  const api = service(db);
  const result = await api.importFile(owner.id, file(call));
  expect(result.ok).toBe(true);
  expect(result.notes).toHaveLength(2);
  const rows = await db.select().from(imageryGenerations);
  expect(rows.every((row) => row.subjectCharacterId === subject.id && row.chatId === null && row.connectionId === null && row.identityHash === null)).toBe(
    true,
  );
  const foreignSubject = {
    ...call,
    execution: {
      ...call.execution,
      sourceCallId: mintTypeId(ID_PREFIX.imageryCall),
      subjectCharacterHandle: "foreign-only",
      connectionId: mintTypeId(ID_PREFIX.userConnection),
      chatId: mintTypeId(ID_PREFIX.chat),
    },
  };
  expect((await api.importFile(owner.id, file(foreignSubject))).notes).toHaveLength(3);
  const foreignRows = (await db.select().from(imageryGenerations)).filter((row) => row.importSource?.sourceCallId === foreignSubject.execution.sourceCallId);
  expect(foreignRows).toHaveLength(2);
  expect(foreignRows.every((row) => row.subjectCharacterId === null)).toBe(true);
  const missingSubject = {
    ...call,
    execution: { ...call.execution, sourceCallId: mintTypeId(ID_PREFIX.imageryCall), subjectCharacterHandle: "custom-handle-not-restored" },
  };
  expect((await api.importFile(owner.id, file(missingSubject))).notes).toContain("The historical subject could not be relinked to an owned character handle.");
  const repeatedMissing = await api.importFile(owner.id, file(missingSubject));
  expect(repeatedMissing.created).toBe(false);
  expect(repeatedMissing.notes).toContain("The historical subject could not be relinked to an owned character handle.");
  const missingRows = (await db.select().from(imageryGenerations)).filter((row) => row.importSource?.sourceCallId === missingSubject.execution.sourceCallId);
  expect(missingRows).toHaveLength(2);
  expect(missingRows.every((row) => row.subjectCharacterId === null)).toBe(true);
});

test("distinct identical calls remain distinct", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const call = makeImageryCall();
  await ownAssets(db, owner.id, call);
  const api = service(db);
  await api.importFile(owner.id, file(call));
  await api.importFile(owner.id, file({ ...call, execution: { ...call.execution, sourceCallId: mintTypeId(ID_PREFIX.imageryCall) } }));
  expect(await db.select().from(imageryGenerations)).toHaveLength(4);
  expect(await db.select().from(imageryImportCalls)).toHaveLength(2);
  expect(await spend(db, owner.id)).toBe(0.25);
});

test("owner deletion cascades import identity and output rows without changing stats RESTRICT policy", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const call = makeImageryCall();
  await ownAssets(db, owner.id, call);
  await service(db).importFile(owner.id, file(call));
  // The real account-deletion workflow clears its RESTRICT-held stats canon before the identity root.
  await db.delete(statsCanonVersions).where(eq(statsCanonVersions.ownerId, owner.id));
  await db.delete(users).where(eq(users.id, owner.id));
  expect(await db.select().from(imageryImportCalls)).toEqual([]);
  expect(await db.select().from(imageryGenerations)).toEqual([]);
});

test("legacy known amount with unavailable usage/source stays unknown through real import and export", async () => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const original = makeImageryCall();
  const call = {
    ...original,
    images: original.images.slice(0, 1),
    execution: {
      ...original.execution,
      sourceCallId: null,
      usage: {
        servedModel: null,
        tokensIn: null,
        tokensOut: null,
        reasoningTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        costProvenance: null,
        costDetails: null,
        tokenDetails: null,
      },
    },
  };
  await ownAssets(db, owner.id, call);
  const api = service(db);
  expect(await api.importFile(owner.id, file(call))).toMatchObject({ ok: true, created: true });
  const stored = (await db.select().from(imageryGenerations))[0];
  expect(stored).toMatchObject({
    costUsd: 0.125,
    tokensIn: null,
    tokensOut: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    costProvenance: null,
    tokenDetails: null,
  });
  const exported: PortableFile[] = [];
  for await (const row of api.exportAll(owner.id)) {
    exported.push(row);
  }
  expect(exported[0]?.bytes).toEqual(buildImageryCall(call));
  expect(await spend(db, owner.id)).toBe(0.125);
});

test.each(RESPONSE_CACHE_STATUSES)("%s response-cache fact restores as inert history through DB, normal read and re-export", async (status) => {
  const db = await freshDb();
  const owner = await seedUser(db);
  const foreign = await seedUser(db);
  const call = makeImageryCall();
  const sourceGenerationId = mintTypeId(ID_PREFIX.imageryGeneration);
  call.execution.usage.responseCache = responseCacheSchema.parse({ status, ageSeconds: status === "hit" ? 15 : null, ttlSeconds: null, sourceGenerationId });
  await ownAssets(db, owner.id, call);
  const api = service(db);
  expect(await api.importFile(owner.id, file(call))).toMatchObject({ ok: true, created: true });
  const stored = await db.select().from(imageryGenerations).orderBy(imageryGenerations.id);
  expect(stored).toHaveLength(2);
  expect(stored.every((row) => row.id !== sourceGenerationId && row.responseCache?.sourceGenerationId === String(sourceGenerationId))).toBe(true);
  for (const image of call.images) {
    expect((await readProvenanceByAsset(db, owner.id, image.assetId))?.usage.responseCache).toEqual(call.execution.usage.responseCache);
    expect(await readProvenanceByAsset(db, foreign.id, image.assetId)).toBeNull();
  }
  const exported: PortableFile[] = [];
  for await (const output of api.exportAll(owner.id)) {
    exported.push(output);
  }
  expect(exported).toHaveLength(1);
  expect(exported[0]?.bytes).toEqual(buildImageryCall(call));
  expect(await api.importFile(owner.id, file(call))).toMatchObject({ ok: true, created: false });
  expect(await db.select().from(imageryGenerations).orderBy(imageryGenerations.id)).toEqual(stored);
  expect(await spend(db, owner.id)).toBe(0.125);
});
