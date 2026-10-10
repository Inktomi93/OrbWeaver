// Annotation reuse proves the asset's owner and immutable bytes, independently of vector lifetime.
import { setImmediate as nextTurn } from "node:timers/promises";
import { assets, embedGenerationTargets, imageAnalyses, imageEmbeddings } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq, sql } from "drizzle-orm";
import { readImageAnalysis, saveImageAnalysis } from "../../../../../packages/server/src/domain/embeddings/persistence/image-analysis.ts";
import { upsertImageEmbedding } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { contentHash } from "../../../../../packages/server/src/domain/embeddings/substrate/hash.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeVector, makeStoreHarness, seedAsset, seedUser } from "../_support.ts";

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("foreign asset and generation IDs cannot authorize annotation or vector writes for the expected owner", async () => {
  const db = await freshDb();
  const expectedOwner = await seedUser(db, { id: "analysis-expected-owner" });
  const actualOwner = await seedUser(db, { id: "analysis-actual-owner" });
  const assetId = await seedAsset(db, actualOwner);
  const h = makeStoreHarness(db);
  const generation = await createEmbeddingsService(h.ctx).resolveGeneration(actualOwner, "imageEmbed");
  expect(generation).not.toBeNull();
  if (generation === null) {
    return;
  }
  const input = {
    ownerId: expectedOwner,
    assetId,
    generationId: generation.id,
    contentHash: contentHash(IMG),
    caption: "accepted private caption",
    captionMeta: { artStyle: "anime" },
    now: h.ctx.now(),
  };
  expect(await saveImageAnalysis(db, input)).toBeUndefined();
  expect(await db.select().from(imageAnalyses)).toHaveLength(0);
  expect(await saveImageAnalysis(db, { ...input, ownerId: actualOwner })).toBe(1);
  for (const lens of ["image-raw", "image-captioned"] as const) {
    const vector = {
      ownerId: actualOwner,
      id: mintTypeId(ID_PREFIX.imageEmbedding),
      assetId,
      lens,
      analysisRevision: lens === "image-captioned" ? 1 : null,
      embedding: fakeVector(generation.dims),
      contentHash: input.contentHash,
      model: generation.space,
      generationId: generation.id,
      dim: generation.dims,
      now: input.now,
    };
    expect(await upsertImageEmbedding(db, vector)).toBe(true);
    const accepted = await db.select().from(imageAnalyses);
    const vectors = await db.select().from(imageEmbeddings);
    expect(await upsertImageEmbedding(db, { ...vector, ownerId: expectedOwner, embedding: new Float32Array(generation.dims) })).toBe(false);
    expect(await saveImageAnalysis(db, { ...input, caption: "foreign replacement" })).toBeUndefined();
    expect(await db.select().from(imageAnalyses)).toEqual(accepted);
    expect(await db.select().from(imageEmbeddings)).toEqual(vectors);
  }
  const accepted = await db.select().from(imageAnalyses);
  const vectors = await db.select().from(imageEmbeddings);
  await db.delete(embedGenerationTargets).where(eq(embedGenerationTargets.generationId, generation.id));
  expect(await saveImageAnalysis(db, { ...input, caption: "foreign retired replacement" })).toBeUndefined();
  expect(
    await upsertImageEmbedding(db, {
      ownerId: expectedOwner,
      id: mintTypeId(ID_PREFIX.imageEmbedding),
      assetId,
      lens: "image-captioned",
      analysisRevision: 1,
      embedding: fakeVector(generation.dims),
      contentHash: input.contentHash,
      model: generation.space,
      generationId: generation.id,
      dim: generation.dims,
      now: input.now,
    }),
  ).toBe(false);
  expect(await db.select().from(imageAnalyses)).toEqual(accepted);
  expect(await db.select().from(imageEmbeddings)).toEqual(vectors);
});

test("a newer annotation gets its own encoder request while duplicate requests for one revision still coalesce", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "analysis-coalescing" });
  const assetId = await seedAsset(db, ownerId);
  const h = makeStoreHarness(db);
  const newerResolved = Promise.withResolvers<void>();
  const announceNextResolution: (() => void)[] = [];
  const svc = createEmbeddingsService({
    ...h.ctx,
    withStableEmbeddingBinding: async (owner, read) => {
      const announce = announceNextResolution.shift();
      const result = await h.ctx.withStableEmbeddingBinding(owner, read);
      announce?.();
      return result;
    },
  });
  const generation = await svc.resolveGeneration(ownerId, "imageEmbed");
  expect(generation).not.toBeNull();
  if (generation === null) {
    return;
  }
  const input = {
    ownerId,
    assetId,
    generationId: generation.id,
    contentHash: contentHash(IMG),
    caption: "older caption",
    captionMeta: { artStyle: "anime" },
    now: h.ctx.now(),
  };
  expect(await saveImageAnalysis(db, input)).toBe(1);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  h.roleClients.imageEmbed.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    return { vectors: [fakeVector()], model: generation.space, usage: { promptTokens: null, totalTokens: null } };
  });
  const params = {
    kind: "avatar",
    lens: "image-captioned",
    ownerId,
    assetId,
    content: IMG,
    caption: input.caption,
    analysisRevision: 1,
    via: "imageEmbed",
    model: generation.space,
    force: true,
  } as const;
  const older = svc.store(params);
  await entered.promise;
  const duplicate = svc.store(params);
  expect(await saveImageAnalysis(db, { ...input, caption: "new paid caption" })).toBe(2);
  announceNextResolution.push(() => newerResolved.resolve());
  const newer = svc.store({ ...params, caption: "new paid caption", analysisRevision: 2 });
  await newerResolved.promise;
  // The newer generation read has settled; drain only its promise-return chain to the coalescing lookup.
  await nextTurn();
  release.resolve();
  const results = await Promise.all([older, duplicate, newer]);
  expect(results.map((result) => result.outcome)).toEqual(["noop", "noop", "written"]);
  expect(h.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
  expect(await db.select().from(imageEmbeddings)).toHaveLength(1);
});

test("an older pending encoder cannot replace a newer paid Utility annotation or land its stale vector", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "analysis-snapshot-race" });
  const assetId = await seedAsset(db, owner);
  const h = makeStoreHarness(db);
  const svc = createEmbeddingsService(h.ctx);
  const generation = await svc.resolveGeneration(owner, "imageEmbed");
  expect(generation).not.toBeNull();
  if (generation === null) {
    return;
  }
  const input = {
    ownerId: owner,
    assetId,
    generationId: generation.id,
    contentHash: contentHash(IMG),
    caption: "old caption",
    captionMeta: { model: "old-utility", artStyle: "anime" as const },
    now: h.ctx.now(),
  };
  await saveImageAnalysis(db, input);
  const snapshot = (await db.select().from(imageAnalyses))[0];
  expect(snapshot).toBeDefined();
  if (snapshot === undefined) {
    return;
  }
  await saveImageAnalysis(db, { ...input, caption: "new paid caption", captionMeta: { model: "new-utility", artStyle: "photorealistic" }, now: input.now + 1 });
  const accepted = await db.select().from(imageAnalyses);
  const landed = await upsertImageEmbedding(db, {
    ownerId: owner,
    id: mintTypeId(ID_PREFIX.imageEmbedding),
    assetId,
    lens: "image-captioned",
    analysisRevision: snapshot.revision,
    embedding: new Float32Array(generation.dims),
    contentHash: input.contentHash,
    model: generation.space,
    generationId: generation.id,
    dim: generation.dims,
    now: input.now + 2,
  });
  expect(landed).toBe(false);
  expect(await db.select().from(imageAnalyses)).toEqual(accepted);
  expect(await db.select().from(imageEmbeddings)).toHaveLength(0);
  const currentRevision = accepted[0]?.revision;
  expect(currentRevision).toBe(2);
  if (currentRevision === undefined) {
    return;
  }
  const vectorInput = {
    ownerId: owner,
    id: mintTypeId(ID_PREFIX.imageEmbedding),
    assetId,
    lens: "image-captioned" as const,
    analysisRevision: currentRevision,
    embedding: Float32Array.from({ length: generation.dims }, () => 1),
    contentHash: input.contentHash,
    model: generation.space,
    generationId: generation.id,
    dim: generation.dims,
    now: input.now + 3,
  };
  expect(await upsertImageEmbedding(db, vectorInput)).toBe(true);
  const currentVectors = await db.select().from(imageEmbeddings);
  expect(await upsertImageEmbedding(db, { ...vectorInput, analysisRevision: snapshot.revision, embedding: new Float32Array(generation.dims) })).toBe(false);
  expect(await db.select().from(imageEmbeddings)).toEqual(currentVectors);
});

test("invalid known facets reject before insertion or invalidating a previously accepted annotation and vector", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "analysis-write-validation" });
  const assetId = await seedAsset(db, owner);
  const h = makeStoreHarness(db);
  const generation = await createEmbeddingsService(h.ctx).resolveGeneration(owner, "imageEmbed");
  expect(generation).not.toBeNull();
  if (generation === null) {
    return;
  }
  const input = {
    ownerId: owner,
    assetId,
    generationId: generation.id,
    contentHash: contentHash(IMG),
    caption: "accepted caption",
    captionMeta: { artStyle: "anime" },
    now: h.ctx.now(),
  };
  await expect(saveImageAnalysis(db, { ...input, captionMeta: { artStyle: "not-an-enum-value" } })).rejects.toThrow();
  expect(await db.select().from(imageAnalyses)).toHaveLength(0);
  expect(await saveImageAnalysis(db, input)).toBe(1);
  await upsertImageEmbedding(db, {
    ownerId: owner,
    id: mintTypeId(ID_PREFIX.imageEmbedding),
    assetId,
    lens: "image-captioned",
    analysisRevision: 1,
    embedding: new Float32Array(generation.dims),
    contentHash: input.contentHash,
    model: generation.space,
    generationId: generation.id,
    dim: generation.dims,
    now: input.now,
  });
  const accepted = await db.select().from(imageAnalyses);
  const vectors = await db.select().from(imageEmbeddings);
  await expect(saveImageAnalysis(db, { ...input, captionMeta: { artStyle: "not-an-enum-value" } })).rejects.toThrow();
  expect(await saveImageAnalysis(db, { ...input, caption: "" })).toBeUndefined();
  expect(await db.select().from(imageAnalyses)).toEqual(accepted);
  expect(await db.select().from(imageEmbeddings)).toEqual(vectors);
});

test("an annotation never crosses owners, changed immutable hashes, malformed facets or model-only skips", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "annotation-owner" });
  const other = await seedUser(db, { id: "annotation-other" });
  const assetId = await seedAsset(db, owner);
  const sameBytesOther = await seedAsset(db, other, { id: mintTypeId(ID_PREFIX.asset) });
  const hash = contentHash(IMG);
  await db
    .insert(imageAnalyses)
    .values({ assetId, contentHash: hash, caption: "original caption", captionMeta: { model: "legacy-utility", artStyle: "anime" }, revision: 1 });
  expect(await readImageAnalysis(db, owner, assetId, hash)).toEqual({
    caption: "original caption",
    captionMeta: { model: "legacy-utility", artStyle: "anime" },
    revision: 1,
  });
  expect(await readImageAnalysis(db, other, assetId, hash)).toBeUndefined();
  expect(await readImageAnalysis(db, other, sameBytesOther, hash)).toBeUndefined();
  expect(await readImageAnalysis(db, owner, assetId, "other-bytes")).toBeUndefined();
  await db.update(assets).set({ hash: "changed" }).where(eq(assets.id, assetId));
  expect(await readImageAnalysis(db, owner, assetId, hash)).toBeUndefined();
  await db.update(assets).set({ hash }).where(eq(assets.id, assetId));
  await db.run(sql`update image_analyses set caption_meta = ${JSON.stringify({ artStyle: "not-in-schema" })} where asset_id = ${assetId}`);
  expect(await readImageAnalysis(db, owner, assetId, hash)).toBeUndefined();
  await db.update(imageAnalyses).set({ captionMeta: { model: "skip" } });
  expect(await readImageAnalysis(db, owner, assetId, hash)).toBeUndefined();
  await db.delete(assets).where(eq(assets.id, assetId));
  expect(await db.select().from(imageAnalyses)).toHaveLength(0);
});

test("retired-generation and foreign-owner writes cannot replace retained Utility analysis", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "annotation-generation" });
  const other = await seedUser(db, { id: "annotation-foreign" });
  const assetId = await seedAsset(db, owner);
  const otherAsset = await seedAsset(db, other, { id: mintTypeId(ID_PREFIX.asset) });
  const h = makeStoreHarness(db, { assetBytes: new Map([[assetId, IMG]]) }, "no-binding");
  const svc = createEmbeddingsService(h.ctx);
  const old = await svc.resolveGeneration(owner, "imageEmbed", "embed");
  expect(old).not.toBeNull();
  if (old === null) {
    return;
  }
  const input = {
    ownerId: owner,
    assetId,
    generationId: old.id,
    contentHash: contentHash(IMG),
    caption: "old Utility result",
    captionMeta: { artStyle: "anime" as const, model: "legacy" },
    now: h.ctx.now(),
  };
  await saveImageAnalysis(db, input);
  const original = await db.select().from(imageAnalyses);
  await saveImageAnalysis(db, { ...input, assetId: otherAsset, caption: "foreign write" });
  expect(await db.select().from(imageAnalyses)).toEqual(original);
  h.embedDtypeAs("q8");
  await svc.resolveGeneration(owner, "imageEmbed", "embed");
  await saveImageAnalysis(db, { ...input, caption: "late write" });
  expect(await db.select().from(imageAnalyses)).toEqual(original);
});
