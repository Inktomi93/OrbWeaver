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

    await svc.resolveVariant({ principal: principal(ownerId), hash, width: OVERSIZED_WIDTH });
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

    const out = await svc.resolveVariant({ principal: principal(ownerId), hash, width: 0 });
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
    });
    expect(out).toBeUndefined();
    expect(h.imageTransform).not.toHaveBeenCalled();
  });
});
