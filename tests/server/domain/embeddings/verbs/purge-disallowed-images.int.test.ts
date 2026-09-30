import { ASSET_KINDS } from "@orb/contracts/assets";
import { assets, imageEmbeddings } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeStoreHarness, seedAsset, seedUser } from "../_support.ts";

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

test("event preparation refuses every non-avatar kind before loading bytes and purging retains the assets", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { handle: castId<Handle>("avatar-policy") });
  const assetId = await seedAsset(db, ownerId);
  const h = makeStoreHarness(db, { assetBytes: new Map([[assetId, IMG]]) });
  const svc = createEmbeddingsService(h.ctx);
  for (const kind of ASSET_KINDS) {
    await db.update(assets).set({ kind }).where(eq(assets.id, assetId));
    h.loadAssetBytes.mockClear();
    await svc.indexAsset(assetId);
    expect(h.loadAssetBytes).toHaveBeenCalledTimes(kind === "avatar" ? 1 : 0);
  }
  expect(await db.select().from(imageEmbeddings)).toHaveLength(2);
  await svc.purgeDisallowedImages();
  expect(await db.select().from(imageEmbeddings)).toHaveLength(0);
  expect(await db.select().from(assets)).toHaveLength(1);
  await db.update(assets).set({ kind: "avatar" }).where(eq(assets.id, assetId));
  await svc.indexAsset(assetId);
  await svc.purgeDisallowedImages();
  expect(await db.select().from(imageEmbeddings)).toHaveLength(2);
});
