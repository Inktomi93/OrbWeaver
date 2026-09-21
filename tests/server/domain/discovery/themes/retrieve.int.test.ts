// readThemes — the owner-scoped theme read. Pins the load-bearing claims: it never crosses owners (D18 —
// `theme_clusters` KEEPS ownerId, D23), an omitted `level` returns BOTH levels ordered by
// (level asc, clusterIdx asc), and a supplied `level` filters to it.

import { themeClusters } from "@orb/db";
import type { ThemeClusterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { readThemes } from "../../../../../packages/server/src/domain/discovery/themes/retrieve.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedUser } from "../_support.ts";

async function seedCluster(db: Awaited<ReturnType<typeof freshDb>>, args: { id: string; ownerId: UserId; level: string; clusterIdx: number }): Promise<void> {
  await db.insert(themeClusters).values({
    id: castId<ThemeClusterId>(args.id),
    ownerId: args.ownerId,
    level: args.level,
    clusterIdx: args.clusterIdx,
    name: `Cluster ${args.id}`,
    size: 1,
    model: "test-embed-model-1024",
    computedAt: FROZEN_AT,
  });
}

describe("readThemes", () => {
  test("scopes strictly to the given owner — another owner's clusters never leak", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const bob = await seedUser(db, "user_bob");
    await seedCluster(db, { id: "theme_alice_1", ownerId: alice, level: "scene", clusterIdx: 0 });
    await seedCluster(db, { id: "theme_bob_1", ownerId: bob, level: "scene", clusterIdx: 0 });

    const aliceThemes = await readThemes(db, alice);

    expect(aliceThemes).toHaveLength(1);
    expect(aliceThemes[0]?.id).toBe("theme_alice_1");
  });

  test("omitted level returns both levels, ordered by (level asc, clusterIdx asc — 'arc' sorts before 'scene')", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await seedCluster(db, { id: "theme_arc_1", ownerId: owner, level: "arc", clusterIdx: 1 });
    await seedCluster(db, { id: "theme_scene_0", ownerId: owner, level: "scene", clusterIdx: 0 });
    await seedCluster(db, { id: "theme_scene_1", ownerId: owner, level: "scene", clusterIdx: 1 });

    const rows = await readThemes(db, owner);

    expect(rows.map((r) => r.id)).toEqual(["theme_arc_1", "theme_scene_0", "theme_scene_1"]);
  });

  test("a supplied level filters to only that level", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await seedCluster(db, { id: "theme_arc_x", ownerId: owner, level: "arc", clusterIdx: 0 });
    await seedCluster(db, { id: "theme_scene_x", ownerId: owner, level: "scene", clusterIdx: 0 });

    const rows = await readThemes(db, owner, "arc");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("theme_arc_x");
  });
});
