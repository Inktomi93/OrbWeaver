// verb: assetCasRefById — the un-principal by-id `(ownerId, hash, mime)` lookup (D20). Feeds the chat
// image-resolution gate: `ownerId` drives the chat-scoped reference-check, `mime` the data-URI. It reads the
// row by id ALONE (no owner scope), returns owner + hash + mime, and returns undefined for a gone id.
// @subject packages/server/src/domain/assets/verbs/asset-cas-ref-by-id.ts

import type { AssetId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, onTestFinished } from "vitest";
import { makeHarness, pngBytes, principal, seedUser } from "../_support.ts";

const PNG = "image/png";

describe("assetCasRefById", () => {
  test("un-principal by-id: returns the stored (ownerId, hash)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1, 2, 3, 4),
      kind: "avatar",
      mime: PNG,
    });

    const coords = await svc.assetCasRefById(stored.assetId);

    expect(coords).toEqual({ ownerId: owner, hash: stored.hash, mime: PNG, kind: "avatar" });
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
