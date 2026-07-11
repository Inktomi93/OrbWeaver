// Integration: PD-40 composed views (CONTENT-only) — home (coverage + top themes + dup counts) + themeDetail
// (cluster + story-time timeline + member characters). Owner-scoped (audit #1).

import type { Db } from "@orb/db";
import { digestThemeAssignments, themeClusters } from "@orb/db";
import type { ThemeClusterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeDiscoveryHarness,
  seedCharacter,
  seedChatDigest,
  seedHostedChat,
  seedUser,
  vec,
} from "../_support.ts";

// 2024-01 story-time.
const JAN_2024 = Date.UTC(2024, 0, 10);

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

async function seedCluster(
  db: Db,
  args: { id: string; ownerId: UserId; level?: string; clusterIdx?: number; name?: string },
): Promise<ThemeClusterId> {
  const id = castId<ThemeClusterId>(args.id);
  await db.insert(themeClusters).values({
    id,
    ownerId: args.ownerId,
    level: args.level ?? "scene",
    clusterIdx: args.clusterIdx ?? 0,
    name: args.name ?? "Adventure",
    centroid: vec(1),
    size: 1,
    model: "test-embed-model-1024",
    computedAt: FROZEN_AT,
  });
  return id;
}

describe("home", () => {
  test("composes coverage + top themes + duplicate counts, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCharacter(db, { id: "character_1", ownerId: owner, name: "One" });
    await seedCharacter(db, { id: "character_2", ownerId: owner, name: "Two" });
    await seedCluster(db, {
      id: "theme_cluster_s",
      ownerId: owner,
      level: "scene",
      name: "Scenes",
    });
    await seedCluster(db, { id: "theme_cluster_a", ownerId: owner, level: "arc", name: "Arcs" });

    const view = await svcFor(db).home(owner);
    expect(view.coverage.characters).toBe(2);
    expect(view.topSceneThemes.map((t) => t.name)).toEqual(["Scenes"]);
    expect(view.topArcThemes.map((t) => t.name)).toEqual(["Arcs"]);
    expect(view.duplicateCounts).toEqual({ characters: 0, chats: 0 });
  });
});

describe("themeDetail", () => {
  test("returns the cluster + story-time timeline + member characters", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const chat = await seedHostedChat(db, "chat_1", owner);
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    const cluster = await seedCluster(db, {
      id: "theme_cluster_1",
      ownerId: owner,
      clusterIdx: 3,
      name: "Quests",
    });
    await seedChatDigest(db, {
      id: "digest_1",
      chatId: chat,
      embedding: vec(1),
      scopedCharacterId: hero,
      tier: 0,
      blockIdx: 0,
      contentHash: "h1",
    });
    await db.insert(digestThemeAssignments).values({
      digestId: castId("digest_1"),
      themeClusterId: cluster,
      msgMidAt: JAN_2024,
      computedAt: FROZEN_AT,
    });

    const detail = await svcFor(db).themeDetail(owner, 3, "scene");
    expect(detail).not.toBeNull();
    expect(detail?.name).toBe("Quests");
    expect(detail?.timeline).toEqual([{ bucket: "2024-01", count: 1 }]);
    expect(detail?.members).toEqual([{ characterId: hero, name: "Hero", count: 1 }]);
  });

  test("null when no cluster matches (clusterIdx, level)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCluster(db, { id: "theme_cluster_1", ownerId: owner, clusterIdx: 0 });
    expect(await svcFor(db).themeDetail(owner, 99, "scene")).toBeNull();
  });

  test("a foreign owner cannot read another owner's theme detail", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedCluster(db, { id: "theme_cluster_1", ownerId: owner, clusterIdx: 0, name: "Mine" });
    // `other` asking for clusterIdx 0 sees nothing (the theme list is owner-scoped).
    expect(await svcFor(db).themeDetail(other, 0, "scene")).toBeNull();
  });
});
