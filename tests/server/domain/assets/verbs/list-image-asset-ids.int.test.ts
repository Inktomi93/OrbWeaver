// verb: listImageAssetIds — the PD-53 bulk embed pass's UN-PRINCIPAL enumeration read (D20). Load-bearing:
// it spans ALL owners (the sweep is a trusted SYSTEM consumer — no owner scope), and it filters to image
// mimes at the source (`mime LIKE 'image/%'`) so a non-image asset — an export zip — never reaches the
// imageEmbed role.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";
const ZIP = "application/zip";

describe("listImageAssetIds", () => {
  test("spans ALL owners (no owner scope) and filters to image mimes", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const alice = await seedUser(db, { handle: castId<Handle>("alice") });
    const bob = await seedUser(db, { handle: castId<Handle>("bob") });

    const aliceAvatar = await svc.store({
      principal: principal(alice),
      bytes: pngBytes(1, 2, 3, 4),
      kind: "avatar",
      mime: PNG,
    });
    const bobAvatar = await svc.store({
      principal: principal(bob),
      bytes: pngBytes(5, 6, 7, 8),
      kind: "avatar",
      mime: PNG,
    });
    // A non-image asset (an export zip) must never enter the imageEmbed sweep universe.
    await svc.store({
      principal: principal(alice),
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]),
      kind: "export",
      mime: ZIP,
    });

    const ids = await svc.listImageAssetIds();

    expect(ids.toSorted()).toEqual([aliceAvatar.assetId, bobAvatar.assetId].sort());
  });

  test("an empty store enumerates to an empty universe", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    expect(await svc.listImageAssetIds()).toEqual([]);
  });
});
