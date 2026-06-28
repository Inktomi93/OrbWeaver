// verb: getMetadata — the owner-gated blob-serve gate (D21). Load-bearing: "not found" and "not yours"
// collapse into one answer (undefined → 404; no foreign-existence leak).

import { createAssetsService } from "@orb/server/domain/assets";
import { describe, expect, onTestFinished, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("getMetadata", () => {
  test("returns {mime,size} for an owned asset", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const bytes = pngBytes(1, 2, 3, 4);

    const stored = await svc.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: PNG,
    });

    const meta = await svc.getMetadata({ principal: principal(owner), hash: stored.hash });
    expect(meta).toEqual({ mime: PNG, size: bytes.byteLength });
  });

  test("another user's asset is indistinguishable from missing (undefined)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });

    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(5, 5),
      kind: "avatar",
      mime: PNG,
    });

    const meta = await svc.getMetadata({ principal: principal(other), hash: stored.hash });
    expect(meta).toBeUndefined();
  });

  test("a missing hash returns undefined", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const meta = await svc.getMetadata({ principal: principal(owner), hash: "f".repeat(64) });
    expect(meta).toBeUndefined();
  });
});
