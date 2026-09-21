// verb: readProvenance — read a generated image's durable provenance by asset (imagery-design/04 §3). Proves
// against a real db: a free-mode generation's provenance is readable by its owner, and a foreign caller reads
// null (owner-scoped through the `assets` join — no cross-owner leak).

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createImageryService } from "@orb/server/domain/imagery";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedGenerationOwner, seedOwner } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("readProvenance", () => {
  test("reads a generated image's provenance; a foreign caller gets null (owner-scoped)", async () => {
    const owner = await seedGenerationOwner(db, castId<Handle>("owner"));
    const stranger = await seedOwner(db, castId<Handle>("stranger"));
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
