// Integration: PD-40 image embedding-analytics — imageDuplicates (cards sharing near-identical art) +
// visualArchetypes (art-style k-means clusters). Owner-scoped; shared/default avatars (≥3 refs) excluded;
// per-space; in-RAM cosine/kmeans.

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedAsset, seedCharacter, seedImageEmbedding, seedUser, vec } from "../_support.ts";

// Seed a character with its OWN avatar asset + an image-raw embedding at `avatarVec`. Optionally distilled
// facets + a captioned lens (caption_meta) for the visual labels.
async function seedAvatarChar(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    name?: string;
    avatarVec: Float32Array;
    assetId?: AssetId;
    genre?: string;
    tone?: string;
    artStyle?: string;
    mood?: string;
  },
): Promise<CharacterId> {
  const asset = args.assetId ?? (await seedAsset(db, `asset_${args.id}`, args.ownerId));
  const charId = await seedCharacter(db, {
    id: args.id,
    ownerId: args.ownerId,
    name: args.name ?? args.id,
    avatarAssetId: asset,
  });
  await seedImageEmbedding(db, {
    id: `img_raw_${args.id}`,
    assetId: asset,
    embedding: args.avatarVec,
    lens: "image-raw",
    contentHash: `raw_${args.id}`,
  });
  if (args.genre !== undefined || args.tone !== undefined) {
    await db.insert(characterSummaries).values({
      characterId: charId,
      genre: args.genre ?? null,
      tone: args.tone ?? null,
      model: "test-summarize-model",
      computedAt: FROZEN_AT,
    });
  }
  if (args.artStyle !== undefined || args.mood !== undefined) {
    await seedImageEmbedding(db, {
      id: `img_cap_${args.id}`,
      assetId: asset,
      embedding: args.avatarVec,
      lens: "image-captioned",
      contentHash: `cap_${args.id}`,
      captionMeta: {
        ...(args.artStyle !== undefined ? { artStyle: args.artStyle } : {}),
        ...(args.mood !== undefined ? { mood: args.mood } : {}),
      },
    });
  }
  return charId;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("imageDuplicates", () => {
  test("pairs cards with near-identical avatar art, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedAvatarChar(db, { id: "a", ownerId: owner, name: "Aria", avatarVec: vec(1, 0) });
    await seedAvatarChar(db, { id: "b", ownerId: owner, name: "Bryn", avatarVec: vec(1, 0.03) });
    await seedAvatarChar(db, { id: "c", ownerId: owner, name: "Cass", avatarVec: vec(0, 1) });
    // A foreign owner's look-alike avatars must not pair with A's.
    await seedAvatarChar(db, { id: "f", ownerId: other, name: "Foe", avatarVec: vec(1, 0) });

    const dups = await svcFor(db).imageDuplicates(owner);
    expect(dups).toHaveLength(1);
    expect([dups[0]?.nameA, dups[0]?.nameB].sort()).toEqual(["Aria", "Bryn"]);
    expect(dups[0]?.similarity ?? 0).toBeGreaterThan(0.92);
  });

  test("excludes a shared/default avatar (≥3 references)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // ONE asset (one image row) is the avatar of THREE characters → shared/default → excluded from analytics.
    const shared = await seedAsset(db, "asset_shared", owner);
    await seedImageEmbedding(db, {
      id: "img_shared",
      assetId: shared,
      embedding: vec(1, 0),
      lens: "image-raw",
    });
    await Promise.all(["s1", "s2", "s3"].map((id) => seedCharacter(db, { id, ownerId: owner, avatarAssetId: shared })));

    expect(await svcFor(db).imageDuplicates(owner)).toEqual([]);
  });
});

describe("visualArchetypes", () => {
  test("clusters avatar vectors and labels from caption artStyle/mood", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // Three "anime · moody" near vec(1,0); three "painterly · serene" near vec(0,1).
    await Promise.all([
      ...Array.from({ length: 3 }, (_, i) =>
        seedAvatarChar(db, {
          id: `anime_${i}`,
          ownerId: owner,
          avatarVec: vec(1, i * 0.001),
          artStyle: "anime",
          mood: "moody",
          genre: "fantasy",
          tone: "dark",
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        seedAvatarChar(db, {
          id: `paint_${i}`,
          ownerId: owner,
          avatarVec: vec(i * 0.001, 1),
          artStyle: "painterly",
          mood: "serene",
          genre: "romance",
          tone: "wholesome",
        }),
      ),
    ]);

    const arch = await svcFor(db).visualArchetypes(owner, 2);
    expect(arch).toHaveLength(2);
    expect(arch.map((a) => a.label).sort()).toEqual(["anime · moody", "painterly · serene"]);
    expect(arch.find((a) => a.artStyle === "anime")?.size).toBe(3);
  });
});
