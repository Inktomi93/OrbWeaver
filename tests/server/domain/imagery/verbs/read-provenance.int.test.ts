// verb: readProvenance — read a generated image's durable provenance by asset (imagery-design/04 §3). Proves
// against a real db: a free-mode generation's provenance is readable by its owner, and a foreign caller reads
// null (owner-scoped through the `assets` join — no cross-owner leak).

import type { Db } from "@orb/db";
import { createImageryService } from "@orb/server/domain/imagery";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedOwner } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("readProvenance", () => {
  test("reads a generated image's provenance; a foreign caller gets null (owner-scoped)", async () => {
    const owner = await seedOwner(db, "owner");
    const stranger = await seedOwner(db, "stranger");
    const svc = createImageryService(makeHarness(db).ctx);

    const gen = await svc.generatePicture({ caller: principal(owner), mode: "free", prompt: "a lighthouse" });
    const image = gen.images[0];
    if (image === undefined) {
      throw new Error("expected one generated image");
    }

    const prov = await svc.readProvenance({ caller: principal(owner), assetId: image.assetId });
    expect(prov).toMatchObject({ assetId: image.assetId, mode: "free", prompt: "a lighthouse", model: "img-model" });
    // A stranger never reads another user's provenance.
    expect(await svc.readProvenance({ caller: principal(stranger), assetId: image.assetId })).toBeNull();
  });
});
