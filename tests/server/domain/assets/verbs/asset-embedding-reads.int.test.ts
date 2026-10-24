// @subject packages/server/src/domain/assets/verbs/asset-embedding-reads.ts
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createAssetEmbeddingReads } from "@orb/server/domain/assets";
import { expect, test } from "@orb/testkit/node";
import { magicBytes, principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

test("the existing asset read adapter maps absent rows only and propagates actual read failures", async ({ harness, services, ids }) => {
  const owner = await harness.actor();
  const reads = createAssetEmbeddingReads(services.assets);
  const absent = typeIdSchema(ID_PREFIX.asset).parse(ids.next(ID_PREFIX.asset));
  expect(await reads.loadAssetBytes(absent)).toBeUndefined();
  const bytes = magicBytes("png");
  const image = await services.assets.store({ principal: await principal(harness, owner.id), bytes, kind: "gallery", mime: "image/png" });
  expect([...((await reads.loadAssetBytes(image.assetId)) ?? [])]).toEqual([...bytes]);
  const integrity = new Error("stored CAS read failed");
  const load = vi.spyOn(services.assets, "loadAssetBytes").mockRejectedValueOnce(integrity);
  try {
    await expect(reads.loadAssetBytes(image.assetId)).rejects.toBe(integrity);
  } finally {
    load.mockRestore();
  }
});
