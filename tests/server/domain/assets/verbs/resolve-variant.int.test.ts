// verb: resolveVariant — the snap → cache → transform pipeline (D6). Load-bearing:
//   • cache miss ⇒ transform the owner's CAS original via the injected imageTransform (with the SNAPPED
//     width + webp format), then cache it.
//   • cache hit ⇒ serve cached bytes, transform NOT called again.
//   • off-ladder/absurd width, a non-hash, and a non-owner all ⇒ undefined (404) with no transform.

import type { UserId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";
// The fake webp the mocked imageTransform returns (mirrors _support FAKE_WEBP — identity assertion).
const FAKE_WEBP = new Uint8Array([0x57, 0x45, 0x42, 0x50, 0xaa, 0xbb]);
// Requested 50 snaps to the 64 rung (smallest ≥ request); 5000 snaps to the 400 top rung.
const REQUESTED_WIDTH = 50;
const SNAPPED_WIDTH = 64;
const OVERSIZED_WIDTH = 5000;
const TOP_RUNG = 400;

async function storeOriginal(
  db: Awaited<ReturnType<typeof freshDb>>,
  h: Awaited<ReturnType<typeof makeHarness>>,
  handle: string,
): Promise<{ ownerId: UserId; hash: string }> {
  const svc = createAssetsService(h.ctx);
  const owner = await seedUser(db, { handle });
  const stored = await svc.store({
    principal: principal(owner),
    bytes: pngBytes(1, 2, 3),
    kind: "avatar",
    mime: PNG,
  });
  return { ownerId: owner, hash: stored.hash };
}

describe("resolveVariant", () => {
  test("transforms on a cache miss with the snapped width, then serves from cache", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "owner");

    const first = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: REQUESTED_WIDTH,
      kind: "icon",
    });
    // Normalize bytes to a number[] — the cache read returns a Node Buffer, the transform a Uint8Array.
    expect(Array.from(first ?? [])).toEqual(Array.from(FAKE_WEBP));
    expect(h.imageTransform).toHaveBeenCalledTimes(1);
    expect(h.imageTransform).toHaveBeenCalledWith(expect.anything(), {
      width: SNAPPED_WIDTH,
      format: "webp",
    });

    const second = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: REQUESTED_WIDTH,
      kind: "icon",
    });
    expect(Array.from(second ?? [])).toEqual(Array.from(FAKE_WEBP));
    // Served from the variant cache — the transform did NOT run a second time.
    expect(h.imageTransform).toHaveBeenCalledTimes(1);
  });

  test("an oversized width snaps to the top rung", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "owner");

    await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: OVERSIZED_WIDTH,
      kind: "icon",
    });
    expect(h.imageTransform).toHaveBeenCalledWith(expect.anything(), {
      width: TOP_RUNG,
      format: "webp",
    });
  });

  test("an absurd width (0) returns undefined and never transforms", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "owner");

    const out = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: 0,
      kind: "icon",
    });
    expect(out).toBeUndefined();
    expect(h.imageTransform).not.toHaveBeenCalled();
  });

  test("a non-hash returns undefined (path-traversal guard) and never transforms", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const out = await svc.resolveVariant({
      principal: principal(owner),
      hash: "../../etc/passwd",
      width: REQUESTED_WIDTH,
      kind: "icon",
    });
    expect(out).toBeUndefined();
    expect(h.imageTransform).not.toHaveBeenCalled();
  });

  test("another user cannot resolve the owner's blob (per-user CAS keying)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { hash } = await storeOriginal(db, h, "owner");
    const other = await seedUser(db, { handle: "other" });

    const out = await svc.resolveVariant({
      principal: principal(other),
      hash,
      width: REQUESTED_WIDTH,
      kind: "icon",
    });
    expect(out).toBeUndefined();
    expect(h.imageTransform).not.toHaveBeenCalled();
  });
});

// §B.4 — the 2:3 smart-cropped portrait ladder: a SEPARATE ladder + cache key from the icon path above
// (never a bigger icon). `PORTRAIT_WIDTHS = [200, 400]`; 2:3 ⇒ height = width * 1.5.
const PORTRAIT_REQUESTED = 150;
const PORTRAIT_SNAPPED_WIDTH = 200;
const PORTRAIT_SNAPPED_HEIGHT = 300;
const PORTRAIT_TOP_WIDTH = 400;
const PORTRAIT_TOP_HEIGHT = 600;
// The icon ladder's snap of the SAME requested width (200) used by the collision test below — the icon
// ladder [48,64,96,128,240,400] snaps 200 up to 240, distinct from the portrait ladder's exact 200 rung.
const ICON_SNAP_OF_200 = 240;

describe("resolveVariant — portrait ladder (kind:'portrait')", () => {
  test("transforms with the snapped (width,height) + fit:cover position:attention, then caches", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "portrait_owner");

    const first = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: PORTRAIT_REQUESTED,
      kind: "portrait",
    });
    expect(Array.from(first ?? [])).toEqual(Array.from(FAKE_WEBP));
    expect(h.imageTransform).toHaveBeenCalledTimes(1);
    expect(h.imageTransform).toHaveBeenCalledWith(expect.anything(), {
      width: PORTRAIT_SNAPPED_WIDTH,
      height: PORTRAIT_SNAPPED_HEIGHT,
      fit: "cover",
      position: "attention",
      format: "webp",
    });

    const second = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: PORTRAIT_REQUESTED,
      kind: "portrait",
    });
    expect(Array.from(second ?? [])).toEqual(Array.from(FAKE_WEBP));
    // Served from the variant cache — the transform did NOT run a second time.
    expect(h.imageTransform).toHaveBeenCalledTimes(1);
  });

  test("an oversized portrait width snaps to the top rung (400x600)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "portrait_oversized");

    await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: OVERSIZED_WIDTH,
      kind: "portrait",
    });
    expect(h.imageTransform).toHaveBeenCalledWith(expect.anything(), {
      width: PORTRAIT_TOP_WIDTH,
      height: PORTRAIT_TOP_HEIGHT,
      fit: "cover",
      position: "attention",
      format: "webp",
    });
  });

  test("the SAME width on the icon vs. portrait ladder never collides — both transform independently", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "portrait_vs_icon");

    // 200 already sits exactly on BOTH ladders (an icon rung is 240, so use a width that snaps to 200
    // on the portrait ladder and to 240 on the icon ladder — the point is the CACHE KEY, not the number).
    await svc.resolveVariant({ principal: principal(ownerId), hash, width: 200, kind: "icon" });
    await svc.resolveVariant({ principal: principal(ownerId), hash, width: 200, kind: "portrait" });
    // Two DISTINCT transforms (icon: width-only; portrait: width+height+fit+position) — neither served
    // the other's cache entry.
    expect(h.imageTransform).toHaveBeenCalledTimes(2);
    expect(h.imageTransform).toHaveBeenNthCalledWith(1, expect.anything(), {
      width: ICON_SNAP_OF_200,
      format: "webp",
    });
    expect(h.imageTransform).toHaveBeenNthCalledWith(2, expect.anything(), {
      width: PORTRAIT_SNAPPED_WIDTH,
      height: PORTRAIT_SNAPPED_HEIGHT,
      fit: "cover",
      position: "attention",
      format: "webp",
    });
  });

  test("an absurd portrait width (0) returns undefined and never transforms", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "portrait_absurd");

    const out = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: 0,
      kind: "portrait",
    });
    expect(out).toBeUndefined();
    expect(h.imageTransform).not.toHaveBeenCalled();
  });
});

// The banner (3:1) smart-cropped ladder — Whisper's header-art band. `BANNER_WIDTHS = [480, 800]`;
// 3:1 ⇒ height = width / 3.
const BANNER_REQUESTED = 500;
const BANNER_SNAPPED_WIDTH = 800;
const BANNER_SNAPPED_HEIGHT = 267;
const BANNER_TOP_WIDTH = 800;
const BANNER_TOP_HEIGHT = 267;

describe("resolveVariant — banner ladder (kind:'banner')", () => {
  test("transforms with the snapped (width,height) + fit:cover position:attention, then caches", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "banner_owner");

    const first = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: BANNER_REQUESTED,
      kind: "banner",
    });
    expect(Array.from(first ?? [])).toEqual(Array.from(FAKE_WEBP));
    expect(h.imageTransform).toHaveBeenCalledTimes(1);
    expect(h.imageTransform).toHaveBeenCalledWith(expect.anything(), {
      width: BANNER_SNAPPED_WIDTH,
      height: BANNER_SNAPPED_HEIGHT,
      fit: "cover",
      position: "attention",
      format: "webp",
    });

    const second = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: BANNER_REQUESTED,
      kind: "banner",
    });
    expect(Array.from(second ?? [])).toEqual(Array.from(FAKE_WEBP));
    // Served from the variant cache — the transform did NOT run a second time.
    expect(h.imageTransform).toHaveBeenCalledTimes(1);
  });

  test("an oversized banner width snaps to the top rung (800x267)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "banner_oversized");

    await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: OVERSIZED_WIDTH,
      kind: "banner",
    });
    expect(h.imageTransform).toHaveBeenCalledWith(expect.anything(), {
      width: BANNER_TOP_WIDTH,
      height: BANNER_TOP_HEIGHT,
      fit: "cover",
      position: "attention",
      format: "webp",
    });
  });

  test("the banner ladder never collides with the portrait ladder at the same width", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "banner_vs_portrait");

    // 400 sits exactly on the portrait ladder's top rung; the banner ladder snaps it up to 800 — two
    // DISTINCT (kind, width) cache keys, neither serving the other's transform.
    await svc.resolveVariant({ principal: principal(ownerId), hash, width: 400, kind: "portrait" });
    await svc.resolveVariant({ principal: principal(ownerId), hash, width: 400, kind: "banner" });
    expect(h.imageTransform).toHaveBeenCalledTimes(2);
    expect(h.imageTransform).toHaveBeenNthCalledWith(1, expect.anything(), {
      width: PORTRAIT_TOP_WIDTH,
      height: PORTRAIT_TOP_HEIGHT,
      fit: "cover",
      position: "attention",
      format: "webp",
    });
    expect(h.imageTransform).toHaveBeenNthCalledWith(2, expect.anything(), {
      width: 480,
      height: 160,
      fit: "cover",
      position: "attention",
      format: "webp",
    });
  });

  test("an absurd banner width (0) returns undefined and never transforms", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const { ownerId, hash } = await storeOriginal(db, h, "banner_absurd");

    const out = await svc.resolveVariant({
      principal: principal(ownerId),
      hash,
      width: 0,
      kind: "banner",
    });
    expect(out).toBeUndefined();
    expect(h.imageTransform).not.toHaveBeenCalled();
  });
});
