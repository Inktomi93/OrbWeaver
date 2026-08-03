// verb: readOwnedAssetBytes — the OWNER-GATED byte read (EC-B). Load-bearing: it round-trips the caller's
// OWN bytes + mime through CAS, and COLLAPSES "not yours" into the same AssetNotFoundError as "missing" (no
// foreign-existence leak, D21). Distinct from loadAssetBytes (the un-principal indexer read, tested separately).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { AssetId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("readOwnedAssetBytes", () => {
  test("owner read: round-trips the stored bytes + mime through CAS", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = pngBytes(9, 8, 7, 6);

    const stored = await svc.store({ principal: principal(owner), bytes, kind: "generated", mime: PNG });
    const read = await svc.readOwnedAssetBytes(principal(owner), stored.assetId);

    expect(Array.from(read.bytes)).toEqual(Array.from(bytes));
    expect(read.mime).toBe(PNG);
  });

  test("owner-gate collapse: a non-owner gets AssetNotFoundError, not the bytes", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });

    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(1, 2, 3, 4), kind: "generated", mime: PNG });

    await expect(svc.readOwnedAssetBytes(principal(stranger), stored.assetId)).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  test("a missing asset id collapses to AssetNotFoundError", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await expect(svc.readOwnedAssetBytes(principal(owner), castId<AssetId>("asset_ghost"))).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
