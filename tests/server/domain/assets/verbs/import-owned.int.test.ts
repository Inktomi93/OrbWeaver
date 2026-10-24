// Private asset bytes are admitted by the real owner-scoped reader before the injected import effect.

import type { Principal } from "@orb/contracts/identity";
import { assets } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";

import type { ExternalId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { isAdmin, isOwner } from "@orb/server/domain/admin";
import { createImportAvatarStore, createImportOwnedAsset } from "@orb/server/domain/assets";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

test("foreign malformed bytes and absence share the same refusal before import; same-owner bytes retain actor and payload", async (): Promise<void> => {
  await using harness = await createServerHarness({
    authConfig: { mode: "forward-header", fallback: "deny", forwardTrustedProxies: ["127.0.0.1/32"] },
    physicalPeer: () => "127.0.0.1",
  });
  const { services } = harness;
  const subject = castId<ExternalId>("native-asset-import-subject");
  const row = await harness.actor({ role: "admin", externalId: subject });
  const observe = vi.spyOn(services.assets, "listOwned");
  let own: Principal;
  try {
    const response = await harness.http.request(`/api/trpc/assets.listOwned?input=${encodeURIComponent(JSON.stringify({ limit: 1 }))}`, {
      headers: { "x-authentik-username": row.handle, "x-authentik-uid": subject },
    });
    await response.arrayBuffer();
    expect(response.status).toBe(200);
    const observed = observe.mock.calls[0]?.[0].principal;
    if (observed === undefined) {
      throw new Error("the real header-authenticated request did not reach the asset owner");
    }
    own = observed;
  } finally {
    observe.mockRestore();
  }
  expect(own.via).toBe("header");
  expect(isAdmin(own)).toBe(true);
  expect(isOwner(own)).toBe(false);
  const foreign = await principal(harness, (await harness.actor()).id);
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
  harness,
  db,
  services,
}): Promise<void> => {
  const actor = await principal(harness, (await harness.actor({ role: "admin" })).id);
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
