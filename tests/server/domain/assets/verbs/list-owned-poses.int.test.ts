// verb: listOwnedPoses — the caller's OWN BYO pose-library entries (comfyui-control §4.12.2, C6c). Invokes the
// verb factory directly over a real-db AssetsContext: the principal's userId drives the owner-scoped read (via
// the `asset_id → assets.ownerId` join — the row has no ownerId, D20), so another user's poses never surface,
// and the optional category narrows the list. The import path is covered by import-poses.int; this pins the verb
// factory itself.

import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, PoseLibraryId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, onTestFinished } from "vitest";
import { insertPoseLibraryRow } from "../../../../../packages/server/src/domain/assets/persistence/poses.ts";
import { createListOwnedPoses } from "../../../../../packages/server/src/domain/assets/verbs/list-owned-poses.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** Seed a `kind:"pose"` asset + its pose_library entry owned by `ownerId`. */
async function seedPose(db: Db, ownerId: UserId, pose: { readonly key: string; readonly category: string; readonly at: number }): Promise<void> {
  const { key, category, at } = pose;
  const assetId = castId<AssetId>(`asset_${key.padEnd(24, "0")}`);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "pose", mime: "image/png", size: 8, hash: `hash-${key}`, uploadedAt: at });
  await insertPoseLibraryRow(db, {
    id: castId<PoseLibraryId>(`pose_library_${key.padEnd(16, "0")}`),
    assetId,
    name: key,
    category,
    tags: [],
    orientation: "portrait",
    now: at,
  });
}

describe("listOwnedPoses verb", () => {
  test("returns only the caller's poses, newest-first; the category filter narrows it", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const listOwnedPoses = createListOwnedPoses(h.ctx);

    const a = await seedUser(db, { handle: "a" });
    const b = await seedUser(db, { handle: "b" });
    await seedPose(db, a, { key: "s1", category: "standing", at: 1000 });
    await seedPose(db, a, { key: "k1", category: "kneeling", at: 2000 });
    await seedPose(db, b, { key: "b1", category: "standing", at: 3000 });

    expect((await listOwnedPoses({ principal: principal(a) })).map((p) => p.name)).toEqual(["k1", "s1"]);
    expect((await listOwnedPoses({ principal: principal(a), category: "standing" })).map((p) => p.name)).toEqual(["s1"]);
    expect((await listOwnedPoses({ principal: principal(b) })).map((p) => p.name)).toEqual(["b1"]);
  });
});
