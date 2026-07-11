// verb: collectGarbage — grace-windowed mark-sweep GC over the whole per-user CAS. Load-bearing assertions:
//   • an ORPHAN BLOB (blob, no row) past grace is reclaimed.
//   • an UNREFERENCED asset (row present, referenced by no registry column) past grace is reclaimed (row +
//     blob), drop-row-before-blob.
//   • a REFERENCED asset (character avatar) is KEPT even when old (liveness beats age).
//   • the GRACE WINDOW protects a recently-touched blob (mtime within grace) even when unreferenced — the
//     put→link gap guard.
//   • `dryRun` counts what it WOULD reclaim without deleting.
// Blob mtimes are set deterministically via `utimes` (the injected clock is frozen; a fresh CAS write stamps
// the real wall clock, so the test controls mtime directly — the same lever `putBytes`' dedup bump pulls).

import { utimes } from "node:fs/promises";
import { assets } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { AssetsHarness } from "../_support.ts";
import {
  makeHarness,
  pngBytes,
  principal,
  seedCharacter,
  seedUser,
  setCharacterAvatar,
} from "../_support.ts";

const PNG = "image/png";
const TWO_HOURS_MS = 2 * 3_600_000;
const MS_PER_SECOND = 1000;

/** Force a blob's mtime to a fixed epoch-ms (the grace check reads `cas.mtimeMs`). */
async function setBlobMtime(
  h: AssetsHarness,
  owner: UserId,
  hash: string,
  atMs: number,
): Promise<void> {
  const seconds = atMs / MS_PER_SECOND;
  await utimes(h.ctx.cas.blobPath(owner, hash), seconds, seconds);
}

describe("collectGarbage", () => {
  test("reclaims an orphan blob (blob, no row) past grace", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    // A blob with NO index row (the crash/DR leak shape).
    const put = await h.ctx.cas.putBytes(owner, pngBytes(1), FROZEN_AT_MS);
    await setBlobMtime(h, owner, put.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await h.ctx.cas.exists(owner, put.hash)).toBe(false);
  });

  test("reclaims an unreferenced asset (row + blob) past grace", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2),
      kind: "avatar",
      mime: PNG,
    });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  test("keeps a referenced asset (character avatar) even when old", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(3),
      kind: "avatar",
      mime: PNG,
    });
    const character = await seedCharacter(db, owner, { handle: "hero" });
    await setCharacterAvatar(db, character, stored.assetId);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("grace window protects a recently-touched unreferenced blob", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(4),
      kind: "avatar",
      mime: PNG,
    });
    // mtime == now ⇒ within any positive grace ⇒ skipped (the put→link gap guard).
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
  });

  test("dryRun counts what it would reclaim without deleting", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(5),
      kind: "avatar",
      mime: PNG,
    });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({ dryRun: true });

    expect(result).toEqual({ scanned: 1, reclaimed: 1, dryRun: true });
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });
});
