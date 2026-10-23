// @subject packages/server/src/entry/compose/databank.ts
// @subject packages/server/src/domain/assets/verbs/asset-embedding-reads.ts
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createAssetEmbeddingReads } from "@orb/server/domain/assets";
import { createGetDatabankSettings } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node";
import { seedUser } from "@orb/testkit/node/composed";
import { magicBytes, principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

test("databank settings remain owner-isolated and live while excluding the chat-only slot budget", async ({ harness, db, services }) => {
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const read = createGetDatabankSettings((userId) => services.settings.loadUserSettings(userId));
  const otherBefore = await read(other.id);
  await services.settings.updateUserSettingsSection({
    principal: await principal(harness, owner.id),
    input: { section: "databank", patch: { chunk: { chunkSize: 1200 }, retrieval: { k: 3, minScore: 0.4, rerank: true }, slotTokenBudget: 2048 } },
  });
  expect(await read(owner.id)).toEqual({ chunk: expect.objectContaining({ chunkSize: 1200 }), retrieval: { k: 3, minScore: 0.4, rerank: true } });
  expect(await read(owner.id)).not.toHaveProperty("slotTokenBudget");
  expect(await read(other.id)).toEqual(otherBefore);
  await services.settings.updateUserSettingsSection({
    principal: await principal(harness, owner.id),
    input: { section: "databank", patch: { chunk: { chunkSize: 700 } } },
  });
  expect((await read(owner.id)).chunk.chunkSize).toBe(700);
});

test("the existing asset read adapter maps absent rows only and propagates actual read failures", async ({ harness, services, ids, db }) => {
  const owner = await seedUser(db);
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
