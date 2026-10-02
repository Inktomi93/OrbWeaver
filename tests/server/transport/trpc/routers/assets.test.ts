// transport/trpc/routers/assets — the owned-asset + gallery surface. Proves: the router is registered on
// the appRouter, authedProcedure rejects anon, and the query verbs delegate to the injected service verb
// with the resolved Principal + the validated input (the same thin-driver contract the other routers hold).
// The mutation verbs (add/remove) are structurally identical authedProcedures; their behavior is covered by
// the domain slice tests.

import type { AssetListItem } from "@orb/contracts/assets";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

describe("assets router", () => {
  const asset = {
    assetId: mintTypeId(ID_PREFIX.asset),
    hash: "asset-hash",
    kind: "gallery",
    mime: "image/png",
    size: 12,
    uploadedAt: 100,
    animated: false,
  } satisfies AssetListItem;

  test("listOwned preserves the declared asset view", async () => {
    const listOwned = vi.fn<AssetsService["listOwned"]>().mockResolvedValue([asset]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listOwned } } });
    await expect(caller(ctx).assets.listOwned({ limit: 20 })).resolves.toEqual([asset]);
  });

  test("listOwned refuses a service result widened with private storage data", async () => {
    const widened = { ...asset, storagePath: "/private/asset.png" };
    const listOwned = vi.fn<AssetsService["listOwned"]>().mockResolvedValue([widened]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listOwned } } });
    await expect(caller(ctx).assets.listOwned({ limit: 20 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
  test("rejects an anonymous caller with UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).assets.listOwned({ limit: 20 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("listOwned delegates to the verb with the Principal + input", async () => {
    const listOwned = vi.fn<AssetsService["listOwned"]>().mockResolvedValue([]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listOwned } } });
    await caller(ctx).assets.listOwned({ limit: 20, kind: "gallery" });
    expect(listOwned).toHaveBeenCalledWith({ principal: ctx.auth, limit: 20, kind: "gallery" });
  });

  test("listGallery delegates to the verb with the Principal + input", async () => {
    const listGallery = vi.fn<AssetsService["listGallery"]>().mockResolvedValue([]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listGallery } } });
    await caller(ctx).assets.listGallery({ limit: 20 });
    expect(listGallery).toHaveBeenCalledWith({ principal: ctx.auth, limit: 20 });
  });

  test("listGallery passes the date order and the one-object keyset cursor through", async () => {
    const listGallery = vi.fn<AssetsService["listGallery"]>().mockResolvedValue([]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listGallery } } });
    const cursor = { createdAt: 5, galleryItemId: mintTypeId(ID_PREFIX.galleryItem) };
    await caller(ctx).assets.listGallery({ limit: 20, sort: "oldest", cursor });
    expect(listGallery).toHaveBeenCalledWith({ principal: ctx.auth, limit: 20, sort: "oldest", cursor });
  });

  test("listGallery refuses a sort outside the date orders", async () => {
    const listGallery = vi.fn<AssetsService["listGallery"]>().mockResolvedValue([]);
    const ctx = makeContext({ auth: principal("user"), services: { assets: { listGallery } } });
    // @ts-expect-error — `name` is not a gallery sort: no name is stored, so the wire refuses it.
    await expect(caller(ctx).assets.listGallery({ limit: 20, sort: "name" })).rejects.toThrow();
    expect(listGallery).not.toHaveBeenCalled();
  });
});
