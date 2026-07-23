// persistence: poses — the pose_library reads/writes (comfyui-control §4.12.2, C6c). Exercises the two
// exported seams directly against a real db: `insertPoseLibraryRow` writes a BYO entry, `selectOwnedPoses`
// reads owner-scoped (via the `asset_id → assets.ownerId` join — the row carries no ownerId, D20), newest-first,
// with the optional category filter and the `tags` JSON round-trip. The owner gate lives in the WHERE, so a row
// whose asset another user owns can never surface (leak-free).

import type { Db } from "@orb/db";
import { assets, poseLibrary } from "@orb/db";
import type { AssetId, PoseLibraryId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { insertPoseLibraryRow, selectOwnedPoses } from "../../../../../packages/server/src/domain/assets/persistence/poses.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const PNG = "image/png";

/** Seed a `kind:"pose"` CAS asset owned by `ownerId` — the FK target the pose_library row hangs off. */
async function seedPoseAsset(db: Db, ownerId: UserId, key: string, at: number): Promise<AssetId> {
  const id = castId<AssetId>(`asset_${key.padEnd(24, "0")}`);
  await db.insert(assets).values({ id, ownerId, kind: "pose", mime: PNG, size: 8, hash: `hash-${key}`, uploadedAt: at });
  return id;
}

interface SeedPoseArgs {
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly tags?: readonly string[];
  readonly at: number;
}

/** Store an asset + its pose_library entry for `ownerId`; returns the pose id. */
async function seedPose(db: Db, ownerId: UserId, args: SeedPoseArgs): Promise<PoseLibraryId> {
  const assetId = await seedPoseAsset(db, ownerId, args.key, args.at);
  const id = castId<PoseLibraryId>(`pose_library_${args.key.padEnd(16, "0")}`);
  await insertPoseLibraryRow(db, {
    id,
    assetId,
    name: args.name,
    category: args.category,
    tags: args.tags ?? [],
    orientation: "portrait",
    now: args.at,
  });
  return id;
}

describe("pose_library persistence", () => {
  test("insertPoseLibraryRow → selectOwnedPoses round-trips the entry (hash from the join, tags parsed)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "a" });
    await seedPose(db, owner, { key: "warrior", name: "warrior stance", category: "standing", tags: ["hero", "melee"], at: 1000 });

    const list = await selectOwnedPoses(db, owner);
    expect(list).toHaveLength(1);
    const pose = list[0];
    expect(pose?.name).toBe("warrior stance");
    expect(pose?.category).toBe("standing");
    expect(pose?.tags).toEqual(["hero", "melee"]);
    expect(pose?.source).toBe("byo");
    expect(pose?.hash).toBe("hash-warrior");
  });

  test("owner-scoped: B never sees A's poses (the asset-join gate)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, { handle: "a" });
    const b = await seedUser(db, { handle: "b" });
    await seedPose(db, a, { key: "apose", name: "a-pose", category: "lying", at: 1000 });
    await seedPose(db, b, { key: "bpose", name: "b-pose", category: "lying", at: 1000 });

    expect((await selectOwnedPoses(db, a)).map((p) => p.name)).toEqual(["a-pose"]);
    expect((await selectOwnedPoses(db, b)).map((p) => p.name)).toEqual(["b-pose"]);
  });

  test("newest-first ordering + the category filter narrows the list", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "a" });
    await seedPose(db, owner, { key: "s1", name: "s1", category: "standing", at: 1000 });
    await seedPose(db, owner, { key: "k1", name: "k1", category: "kneeling", at: 2000 });
    await seedPose(db, owner, { key: "s2", name: "s2", category: "standing", at: 3000 });

    // Newest-createdAt first.
    expect((await selectOwnedPoses(db, owner)).map((p) => p.name)).toEqual(["s2", "k1", "s1"]);
    // Category filter, still newest-first within the category.
    expect((await selectOwnedPoses(db, owner, "standing")).map((p) => p.name)).toEqual(["s2", "s1"]);
  });

  test("malformed persisted tags degrade to an empty array (never throw)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "a" });
    const assetId = await seedPoseAsset(db, owner, "bad", 1000);
    // A row whose tags column is not a JSON array — the parse must not throw.
    await db.insert(poseLibrary).values({
      id: castId<PoseLibraryId>("pose_library_bad00000000000"),
      assetId,
      name: "bad-tags",
      category: "standing",
      tags: "not-json",
      orientation: "portrait",
      source: "byo",
      createdAt: 1000,
    });

    expect((await selectOwnedPoses(db, owner))[0]?.tags).toEqual([]);
  });
});
