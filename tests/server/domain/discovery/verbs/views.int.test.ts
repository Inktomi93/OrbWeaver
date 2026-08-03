// Integration: PD-40 composed views (CONTENT-only) — home (coverage + top themes + dup counts) + themeDetail
// (cluster + story-time timeline + member characters). Owner-scoped (audit #1).

import type { Db } from "@orb/db";
import { characterSummaries, digestThemeAssignments, themeClusters } from "@orb/db";
import type { CharacterId, ThemeClusterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DiscoveryContext } from "@orb/server/domain/discovery";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  FROZEN_AT,
  makeDiscoveryHarness,
  seedAsset,
  seedCharacter,
  seedCharacterEmbedding,
  seedChatDigest,
  seedHostedChat,
  seedImageEmbedding,
  seedUser,
  vec,
} from "../_support.ts";

// 2024-01 story-time.
const JAN_2024 = Date.UTC(2024, 0, 10);

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

async function seedCluster(db: Db, args: { id: string; ownerId: UserId; level?: string; clusterIdx?: number; name?: string }): Promise<ThemeClusterId> {
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

describe("characterDossier", () => {
  // A scripted `similar` op standing in for the injected search seam — asserts the cross-domain composition
  // without pulling search into this test (the "inject the faked dep at the root" doctrine).
  const neighbor = {
    characterId: castId<CharacterId>("character_neighbor"),
    name: "Neighbor",
    score: 0.9,
    avatarHash: "cas_neighbor",
    genre: "fantasy",
    tone: "dark",
    elevatorPitch: "A kindred spirit.",
  } as const;

  async function seedDossierCard(db: Db, ownerId: UserId): Promise<CharacterId> {
    const assetId = await seedAsset(db, "asset_hero", ownerId);
    const hero = await seedCharacter(db, {
      id: "character_hero",
      ownerId,
      name: "Hero",
      avatarAssetId: assetId,
    });
    await db.insert(characterSummaries).values({
      characterId: hero,
      genre: "fantasy",
      tone: "dark",
      tags: ["dragons", "curse"],
      elevatorPitch: "A cursed knight.",
      model: "test-embed-model-1024",
      computedAt: FROZEN_AT,
    });
    // A paired card-text + avatar vector in the SAME model space → the in-RAM portrait cosine.
    await seedCharacterEmbedding(db, { characterId: hero, embedding: vec(1) });
    await seedImageEmbedding(db, { id: "img_hero", assetId, embedding: vec(1), lens: "image-raw" });
    return hero;
  }

  function dossierSvc(db: Db, similar?: DiscoveryContext["similar"]): ReturnType<typeof createDiscoveryService> {
    return createDiscoveryService(makeDiscoveryHarness(db, similar ? { similar } : {}).ctx);
  }

  test("composes facets + portrait alignment + the injected similar neighbours", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const hero = await seedDossierCard(db, owner);
    const similar: DiscoveryContext["similar"] = async () => [neighbor];

    const dossier = await dossierSvc(db, similar).characterDossier(owner, hero);
    expect(dossier).not.toBeNull();
    expect(dossier?.name).toBe("Hero");
    expect(dossier?.genre).toBe("fantasy");
    expect(dossier?.tags).toEqual(["dragons", "curse"]);
    // cardVec == imageVec == vec(1) → cosine 1.
    expect(dossier?.portrait).toEqual({ avatarHash: "cas_asset_hero", alignment: 1 });
    expect(dossier?.similar).toEqual([neighbor]);
  });

  test("null portrait when the character has no paired card/avatar vector", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // Owned + distilled, but NO character/image embedding → no portrait pair.
    const bare = await seedCharacter(db, { id: "character_bare", ownerId: owner, name: "Bare" });
    await db.insert(characterSummaries).values({
      characterId: bare,
      genre: "horror",
      tone: null,
      tags: [],
      elevatorPitch: null,
      model: "test-embed-model-1024",
      computedAt: FROZEN_AT,
    });

    const dossier = await dossierSvc(db).characterDossier(owner, bare);
    expect(dossier).not.toBeNull();
    expect(dossier?.portrait).toBeNull();
    expect(dossier?.similar).toEqual([]); // default harness `similar` = no neighbours
  });

  test("null on a foreign/undistilled character (owner belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    // owner A's fully-seeded card, requested by the stranger → null (readOwnedCardFacet belts on ownerId).
    const hero = await seedDossierCard(db, owner);
    expect(await dossierSvc(db).characterDossier(other, hero)).toBeNull();
    // An owned but UNDISTILLED character also fails the belt.
    const bare = await seedCharacter(db, { id: "character_bare", ownerId: owner, name: "Bare" });
    expect(await dossierSvc(db).characterDossier(owner, bare)).toBeNull();
    expect(await dossierSvc(db).characterDossier(owner, castId<CharacterId>("nope"))).toBeNull();
  });
});
