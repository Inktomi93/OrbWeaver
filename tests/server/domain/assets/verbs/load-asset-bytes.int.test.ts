// verb: loadAssetBytes — the embeddings indexer's UN-PRINCIPAL avatar-bytes re-reader (D20: no owner gate).
// Load-bearing: it reads the row by id ALONE (no principal), derives the row's ownerId only to key the
// per-user CAS, round-trips the exact stored bytes back through CAS, and returns null for a missing asset
// (deleted between emit and handler) — never a foreign-existence throw.

import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("loadAssetBytes", () => {
  test("un-principal by-id read: round-trips the stored bytes through CAS", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const bytes = pngBytes(11, 22, 33, 44);

    const stored = await svc.store({
      principal: principal(owner),
      bytes,
      kind: "avatar",
      mime: PNG,
    });

    // No principal — the indexer re-reads by id alone (D20); the owner is derived from the row to key CAS.
    const read = await svc.loadAssetBytes(stored.assetId);

    expect(read).not.toBeNull();
    expect(read && Array.from(read)).toEqual(Array.from(bytes));
  });

  test("a missing asset id is null (deleted between emit and handler) — never throws", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    expect(await svc.loadAssetBytes(castId<AssetId>("asset_ghost"))).toBeNull();
  });
});
