import { imageEmbeddings } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeStoreHarness, seedAsset, seedUser } from "../_support.ts";

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const signal = (): AbortSignal => new AbortController().signal;

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
