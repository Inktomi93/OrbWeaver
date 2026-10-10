import { imageAnalyses, imageEmbeddings } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { contentHash } from "../../../../../packages/server/src/domain/embeddings/substrate/hash.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeStoreHarness, seedAsset, seedUser } from "../_support.ts";

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const signal = (): AbortSignal => new AbortController().signal;

test("moving the text encoder generation reuses the owner's paid image analysis", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { handle: castId<Handle>("analysis-retained") });
  const assetId = await seedAsset(db, ownerId, { hash: contentHash(IMG) });
  const h = makeStoreHarness(db, { imageAssetIds: [assetId], assetBytes: new Map([[assetId, IMG]]) }, "no-binding");
  const svc = createEmbeddingsService(h.ctx);
  await svc.indexAsset(assetId);
  await db.update(imageAnalyses).set({ captionMeta: { model: "original-utility", artStyle: "anime", futureFacet: "retained" } });
  const before = (await db.select().from(imageEmbeddings))[0];
  const analysisBefore = await db.select().from(imageAnalyses);
  h.roleClients.summarize.mockClear();
  h.roleClients.embed.mockClear();
  h.embedDtypeAs("q8");
  await svc.indexAsset(assetId);
  const after = (await db.select().from(imageEmbeddings))[0];
  expect(h.roleClients.summarize).not.toHaveBeenCalled();
  expect(h.roleClients.embed).toHaveBeenCalledWith(analysisBefore[0]?.caption, expect.anything());
  expect(after?.generationId).not.toBe(before?.generationId);
  expect(await db.select().from(imageAnalyses)).toEqual(analysisBefore);
});

test("automatic forced rebuild retains analysis, while an explicit force regenerates Utility output", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { handle: castId<Handle>("analysis-force-policy") });
  const assetId = await seedAsset(db, ownerId);
  const h = makeStoreHarness(db, { imageAssetIds: [assetId], assetBytes: new Map([[assetId, IMG]]) });
  const svc = createEmbeddingsService(h.ctx);
  await svc.indexAsset(assetId);
  const retained = await db.select().from(imageAnalyses);
  h.roleClients.summarize.mockClear();
  expect(await svc.countAssetAnalysisCalls({ ownerId, force: true, embedderChanged: true })).toBe(0);
  await svc.embedAssets({ ownerId, force: true, embedderChanged: true, signal: signal() });
  expect(h.roleClients.summarize).not.toHaveBeenCalled();
  expect(await db.select().from(imageAnalyses)).toEqual(retained);
  await svc.embedAssets({ ownerId, force: true, signal: signal() });
  expect(h.roleClients.summarize).toHaveBeenCalledTimes(1);
});

test("successful paid analysis survives a failed caption encoder, and invalidates its old vector", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { handle: castId<Handle>("analysis-encoder-retry") });
  const assetId = await seedAsset(db, ownerId);
  const h = makeStoreHarness(db, { imageAssetIds: [assetId], assetBytes: new Map([[assetId, IMG]]) }, "no-binding");
  const svc = createEmbeddingsService(h.ctx);
  await svc.indexAsset(assetId);
  h.roleClients.embed.mockRejectedValueOnce(new Error("encoder unavailable"));
  await expect(svc.indexAsset(assetId, { force: true })).rejects.toThrow("encoder unavailable");
  expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.lens, "image-captioned"))).toHaveLength(0);
  expect(await db.select().from(imageAnalyses)).toHaveLength(1);
  h.roleClients.summarize.mockClear();
  await svc.indexAsset(assetId);
  expect(h.roleClients.summarize).not.toHaveBeenCalled();
  expect(await db.select().from(imageEmbeddings)).toHaveLength(1);
});

test("an event racing the sweep shares preparation before caption and both vector calls", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { handle: castId<Handle>("avatar-race") });
  const assetId = await seedAsset(db, ownerId);
  const h = makeStoreHarness(db, { imageAssetIds: [assetId], assetBytes: new Map([[assetId, IMG]]) });
  const svc = createEmbeddingsService(h.ctx);
  await Promise.all([svc.indexAsset(assetId), svc.embedAssets({ force: false, signal: signal(), ownerId })]);
  expect(h.roleClients.summarize).toHaveBeenCalledTimes(1);
  expect(h.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
  expect(await db.select().from(imageEmbeddings)).toHaveLength(2);
});
