// verb: removeFromGallery — gallery v2 (§1.3). Owner resolved THROUGH the asset join; a non-owner/missing
// item rejects leak-free (NOT_FOUND). Also covers the FK cascade: deleting the underlying asset erases its
// gallery rows (schema `onDelete: "cascade"`).

import { assets } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";
const ALL = 100;

describe("removeFromGallery", () => {
  test("owner removes their own item", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });
    const item = await svc.addToGallery({ principal: principal(owner), assetId: asset.assetId });

    await svc.removeFromGallery({ principal: principal(owner), galleryItemId: item.galleryItemId });
    expect(await svc.listGallery({ principal: principal(owner), limit: ALL })).toHaveLength(0);
  });

  test("a non-owner cannot remove another user's item (leak-free NOT_FOUND); the item survives", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2),
      kind: "gallery",
      mime: PNG,
    });
    const item = await svc.addToGallery({ principal: principal(owner), assetId: asset.assetId });

    await expect(svc.removeFromGallery({ principal: principal(other), galleryItemId: item.galleryItemId })).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(await svc.listGallery({ principal: principal(owner), limit: ALL })).toHaveLength(1);
  });

  test("deleting the asset cascades its gallery rows", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(3),
      kind: "gallery",
      mime: PNG,
    });
    await svc.addToGallery({ principal: principal(owner), assetId: asset.assetId });

    await db.delete(assets).where(eq(assets.id, asset.assetId));
    expect(await svc.listGallery({ principal: principal(owner), limit: ALL })).toHaveLength(0);
  });
});
