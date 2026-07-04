// verb: assetCasRefById — the un-principal by-id `(ownerId, hash)` coordinate lookup (D20). Feeds the chat
// image-resolution gate: turn a canon `asset:<id>` ref into the content hash `getMetadata` gates on. It reads
// the row by id ALONE (no owner scope), returns the stored owner + hash, and returns undefined for a gone id.

import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

// biome-ignore lint/security/noSecrets: the describe label is a function name, not a secret.
describe("assetCasRefById", () => {
  test("un-principal by-id: returns the stored (ownerId, hash)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1, 2, 3, 4),
      kind: "avatar",
      mime: PNG,
    });

    const coords = await svc.assetCasRefById(stored.assetId);

    expect(coords).toEqual({ ownerId: owner, hash: stored.hash });
  });

  test("a missing asset id is undefined (never throws)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);

    const coords = await svc.assetCasRefById(castId<AssetId>("asset_nope"));

    expect(coords).toBeUndefined();
  });
});
