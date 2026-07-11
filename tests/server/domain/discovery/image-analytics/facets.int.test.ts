// Integration: PD-40 image cross-modal + caption-facet analytics — portraitAlignment (PAIRED in-RAM cosine of
// card vs avatar), imageFacets (caption_meta distributions), charactersByImageFacet (facet drill, §7.5
// allowlisted dispatch). Owner-scoped; shared avatars excluded.

import type { Db } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  makeDiscoveryHarness,
  seedAsset,
  seedCharacter,
  seedCharacterEmbedding,
  seedImageEmbedding,
  seedUser,
  vec,
} from "../_support.ts";

// Seed a character with a card-text vector + an image-raw avatar vector (same model) + a captioned lens.
async function seedPortraitChar(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    name?: string;
    cardVec: Float32Array;
    avatarVec: Float32Array;
    assetId?: AssetId;
    caption?: string;
    captionMeta?: Record<string, unknown>;
  },
): Promise<CharacterId> {
  const asset = args.assetId ?? (await seedAsset(db, `asset_${args.id}`, args.ownerId));
  const charId = await seedCharacter(db, {
    id: args.id,
    ownerId: args.ownerId,
    name: args.name ?? args.id,
    avatarAssetId: asset,
  });
  await seedCharacterEmbedding(db, {
    characterId: charId,
    embedding: args.cardVec,
    contentHash: `card_${args.id}`,
  });
  await seedImageEmbedding(db, {
    id: `img_raw_${args.id}`,
    assetId: asset,
    embedding: args.avatarVec,
    lens: "image-raw",
    contentHash: `raw_${args.id}`,
  });
  if (args.captionMeta !== undefined || args.caption !== undefined) {
    await seedImageEmbedding(db, {
      id: `img_cap_${args.id}`,
      assetId: asset,
      embedding: args.avatarVec,
      lens: "image-captioned",
      contentHash: `cap_${args.id}`,
      ...(args.caption !== undefined ? { caption: args.caption } : {}),
      ...(args.captionMeta !== undefined ? { captionMeta: args.captionMeta } : {}),
    });
  }
  return charId;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("portraitAlignment", () => {
  test("scores card↔avatar cross-modal cosine, worst-matched first, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    // Aligned: card + avatar both vec(1,0) → cosine 1. Misaligned: card vec(1,0), avatar vec(0,1) → cosine 0.
    await seedPortraitChar(db, {
      id: "aligned",
      ownerId: owner,
      name: "Aligned",
      cardVec: vec(1, 0),
      avatarVec: vec(1, 0),
      captionMeta: { rating: "safe", artStyle: "anime" },
    });
    await seedPortraitChar(db, {
      id: "off",
      ownerId: owner,
      name: "Off",
      cardVec: vec(1, 0),
      avatarVec: vec(0, 1),
    });
    // Foreign owner's char must not appear.
    await seedPortraitChar(db, {
      id: "foreign",
      ownerId: other,
      cardVec: vec(1, 0),
      avatarVec: vec(1, 0),
    });

    const report = await svcFor(db).portraitAlignment(owner);
    expect(report.count).toBe(2);
    // Ascending: the misaligned "Off" (≈0) comes first.
    expect(report.characters[0]?.name).toBe("Off");
    expect(report.characters[0]?.alignment ?? 1).toBeLessThan(0.1);
    expect(report.characters[1]).toMatchObject({
      name: "Aligned",
      rating: "safe",
      artStyle: "anime",
    });
    expect(report.characters[1]?.alignment ?? 0).toBeGreaterThan(0.99);
  });
});

describe("imageFacets + charactersByImageFacet", () => {
  test("tallies caption facets and drills a facet to its characters", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedPortraitChar(db, {
      id: "a",
      ownerId: owner,
      name: "Aria",
      cardVec: vec(1, 0),
      avatarVec: vec(1, 0),
      captionMeta: { artStyle: "anime", rating: "safe", tags: ["sword", "armor"] },
    });
    await seedPortraitChar(db, {
      id: "b",
      ownerId: owner,
      name: "Bryn",
      cardVec: vec(0, 1),
      avatarVec: vec(0, 1),
      captionMeta: { artStyle: "anime", rating: "explicit", tags: ["sword"] },
    });

    const facets = await svcFor(db).imageFacets(owner);
    expect(facets.total).toBe(2);
    expect(facets.artStyles).toEqual([{ value: "anime", count: 2 }]);
    expect(facets.ratings).toContainEqual({ value: "safe", count: 1 });
    expect(facets.topTags).toContainEqual({ value: "sword", count: 2 });

    // Scalar facet drill (artStyle=anime → both).
    const anime = await svcFor(db).charactersByImageFacet(owner, "artStyle", "anime");
    expect(anime.map((m) => m.name).sort()).toEqual(["Aria", "Bryn"]);
    // List facet drill (tag=armor → only Aria).
    const armor = await svcFor(db).charactersByImageFacet(owner, "tag", "armor");
    expect(armor.map((m) => m.name)).toEqual(["Aria"]);
  });
});
