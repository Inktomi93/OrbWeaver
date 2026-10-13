// Private asset bytes are admitted by the real owner-scoped reader before the injected import effect.

import { assets } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";

import "@orb/testkit/node/composed-real.ts";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createImportAvatarStore, createImportOwnedAsset } from "@orb/server/domain/assets";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

test("foreign malformed bytes and absence share the same refusal before import; same-owner bytes retain actor and payload", async ({
  db,
  services,
}): Promise<void> => {
  const own = principal((await seedUser(db, { role: "admin" })).id, { role: "admin", via: "header" });
  const foreign = principal((await seedUser(db)).id);
  const privateBytes = new TextEncoder().encode("Foreign private malformed card");
  const stored = await services.assets.store({ principal: foreign, bytes: privateBytes, kind: "avatar", mime: "image/png", enforceMagic: false });
  const ownBytes = new TextEncoder().encode("Owner card bytes");
  const ownStored = await services.assets.store({ principal: own, bytes: ownBytes, kind: "avatar", mime: "image/png", enforceMagic: false });
  const resolve = vi.fn(async () => own);
  const importBytes = vi.fn(async (_owner: UserId, bytes: Uint8Array) => bytes);
  const read = vi.spyOn(services.assets, "readOwnedAssetBytes");
  const ingest = createImportOwnedAsset({
    resolvePrincipal: resolve,
    readOwnedAssetBytes: (actor, id) => services.assets.readOwnedAssetBytes(actor, id),
    importBytes,
  });
  await expect(ingest({ installerUserId: own.userId, assetId: stored.assetId, pluginId: null })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(ingest({ installerUserId: own.userId, assetId: mintTypeId(ID_PREFIX.asset), pluginId: null })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(importBytes).not.toHaveBeenCalled();
  expect(Array.from(await ingest({ installerUserId: own.userId, assetId: ownStored.assetId, pluginId: null }))).toEqual(Array.from(ownBytes));
  expect(read.mock.calls.every(([actor]) => actor === own)).toBe(true);
  expect(importBytes.mock.calls[0]?.[0]).toBe(own.userId);
  expect(Array.from(importBytes.mock.calls[0]?.[1] ?? [])).toEqual(Array.from(ownBytes));
});

test("avatar policy retains the original Principal and false-magic flag while a caller's byte cap refuses before storage", async ({
  db,
  services,
}): Promise<void> => {
  const actor = principal((await seedUser(db, { role: "admin" })).id, { role: "admin" });
  const bytes = new TextEncoder().encode("Already parsed avatar bytes");
  const stored = vi.spyOn(services.assets, "store");
  const capped = createImportAvatarStore(actor, (params) => services.assets.store({ ...params, maxBytes: 1 }));
  await expect(capped({ bytes, mime: "image/png" })).rejects.toThrow();
  expect(stored.mock.calls[0]?.[0]).toMatchObject({ principal: actor, enforceMagic: false, kind: "avatar", maxBytes: 1 });
  expect(await db.select().from(assets)).toEqual([]);
  const store = createImportAvatarStore(actor, (params) => services.assets.store(params));
  const assetId = await store({ bytes, mime: "image/png" });
  expect(Array.from((await services.assets.readOwnedAssetBytes(actor, assetId)).bytes)).toEqual(Array.from(bytes));
  expect(stored.mock.calls[1]?.[0].principal).toBe(actor);
});
