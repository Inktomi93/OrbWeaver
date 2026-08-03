// verb: fsck — read-only integrity report. Load-bearing assertions:
//   • a clean store reports zero faults.
//   • an ORPHAN BLOB (blob, no row) is counted.
//   • a DANGLING ROW (row, no blob) is counted (the never-supposed-to-happen fault the ordering prevents).
//   • fsck mutates NOTHING (the row + blob survive a scan).

import { assets } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("fsck", () => {
  test("a clean store reports zero faults", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "avatar",
      mime: PNG,
    });

    const report = await svc.fsck();

    expect(report).toEqual({
      scannedRows: 1,
      scannedBlobs: 1,
      danglingRows: 0,
      corruptBlobs: 0,
      orphanBlobs: 0,
    });
    // Nothing mutated.
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("an orphan blob (blob, no row) is counted", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await h.ctx.cas.putBytes(owner, pngBytes(2), FROZEN_AT_MS);

    const report = await svc.fsck();

    expect(report.orphanBlobs).toBe(1);
    expect(report.scannedBlobs).toBe(1);
    expect(report.danglingRows).toBe(0);
  });

  test("a dangling row (row, no blob) is counted", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(3),
      kind: "avatar",
      mime: PNG,
    });
    // Delete the blob out from under the row (leaves a dangling row).
    await h.ctx.cas.remove(owner, stored.hash);

    const report = await svc.fsck();

    expect(report.danglingRows).toBe(1);
    expect(report.scannedRows).toBe(1);
    expect(report.orphanBlobs).toBe(0);
  });
});
