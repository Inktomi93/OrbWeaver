// Integration: image embedding-analytics — imageDuplicates (cards sharing near-identical art) +
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
    shotType?: string;
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
  if (args.artStyle !== undefined || args.mood !== undefined || args.shotType !== undefined) {
    await seedImageEmbedding(db, {
      id: `img_cap_${args.id}`,
      assetId: asset,
      embedding: args.avatarVec,
      lens: "image-captioned",
      contentHash: `cap_${args.id}`,
      captionMeta: {
        ...(args.artStyle !== undefined ? { artStyle: args.artStyle } : {}),
        ...(args.mood !== undefined ? { mood: args.mood } : {}),
        ...(args.shotType !== undefined ? { shotType: args.shotType } : {}),
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
    // ONE term is enough when it is already distinctive: each style holds its whole cluster and half the
    // corpus, so its lift is 2 and nothing else needs to be said. The label GROWS a second term only to
    // break a tie (pinned below) — a label that always concatenates is a list, not a name.
    expect(arch.map((a) => a.label).sort()).toEqual(["anime", "painterly"]);
    expect(arch.find((a) => a.artStyle === "anime")?.size).toBe(3);
    // The card-text facets ride along as CONTEXT, and are provably NOT the label.
    expect(arch.find((a) => a.artStyle === "anime")?.genre).toBe("fantasy");
  });

  // ── issue #164: the two defects the owner receipted ────────────────────────────────────────────────
  test("A VISUAL FAMILY IS NEVER NAMED FROM CARD TEXT — with no breakdown it says so instead", async () => {
    // THE SMOKING GUN, reproduced: the family whose members are grouped precisely BY their missing art was
    // rendering "melancholic fantasy" — the mode of its members' card-text genre/tone — because the label
    // fell through `[tone, genre]` whenever the caption facets were null. They were ALWAYS null: nothing
    // produced them until the VL breakdown landed. A cluster with no visual reading has nothing to say
    // about how it looks, and saying so is the only honest name.
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        seedAvatarChar(db, { id: `noart_${i}`, ownerId: owner, avatarVec: vec(1, i * 0.001), genre: "fantasy", tone: "melancholic" }),
      ),
    );

    const arch = await svcFor(db).visualArchetypes(owner, 1);
    expect(arch).toHaveLength(1);
    expect(arch[0]?.label).toBe("unanalysed portraits");
    // The card-text reading still rides the payload — it is context, and context is not a name.
    expect(arch[0]?.genre).toBe("fantasy");
    expect(arch[0]?.tone).toBe("melancholic");
  });

  test("TWO FAMILIES NEVER WEAR THE SAME LABEL — a tie qualifies rather than repeating", async () => {
    // The live defect: three of eight families rendered the identical "wholesome slice-of-life", because a
    // 46-member cluster's MODE in a corpus that is 30% one value IS that value. Here both clusters share
    // their art style and mood outright, so a mode-based labeller emits one string twice; the lift labeller
    // discards the facets the corpus already has everywhere and names each family by what it has MORE of.
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await Promise.all([
      ...Array.from({ length: 3 }, (_, i) =>
        seedAvatarChar(db, { id: `close_${i}`, ownerId: owner, avatarVec: vec(1, i * 0.001), artStyle: "anime", mood: "cheerful", shotType: "close-up" }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        seedAvatarChar(db, { id: `wide_${i}`, ownerId: owner, avatarVec: vec(i * 0.001, 1), artStyle: "anime", mood: "cheerful", shotType: "wide" }),
      ),
    ]);

    const labels = (await svcFor(db).visualArchetypes(owner, 2)).map((a) => a.label);
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(labels.toSorted()).toEqual(["close-up", "wide"]);
  });

  // The member slice carries the portrait hash on the WIRE (issue #134) — this read clusters BY the avatar,
  // so the hash is already in hand and the corpus surface no longer joins `portraitAlignment` for its faces.
  // Never null here by construction: a row without a current-avatar asset has no avatar vector to cluster.
  test("members carry the avatar's CAS hash", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await Promise.all(
      Array.from({ length: 3 }, (_, i) => seedAvatarChar(db, { id: `face_${i}`, ownerId: owner, avatarVec: vec(1, i * 0.001), artStyle: "anime" })),
    );

    const members = (await svcFor(db).visualArchetypes(owner, 1)).flatMap((a) => a.members);
    expect(members).toHaveLength(3);
    for (const member of members) {
      expect(member).toHaveProperty("avatarHash", `cas_asset_${member.name}`);
    }
  });
});

// #1467 item 4: `labelClusters` sorts by size and the sort DECIDES the labels (the biggest family takes the
// plain name, the rest qualify around it). Equal-sized families were left in k-means' cluster-index order —
// assignment order over an unordered SELECT — so an unchanged corpus could swap two families' labels.
describe("visualArchetypes labelling is deterministic across equal-sized families", () => {
  test("the same corpus seeded in the opposite order produces the same labels", async () => {
    const labelsFor = async (reversed: boolean): Promise<string[]> => {
      const db = await freshDb();
      const owner = await seedUser(db, "user_a");
      // Two well-separated visual families of the SAME size — the tie the sort has to break. (Well separated
      // on purpose: k-means itself must land the same PARTITION either way, so the only thing left moving is
      // the cluster-index order the labeller used to inherit.)
      const family = [
        { id: "character_a1", avatarVec: vec(1, 0), style: "anime" },
        { id: "character_a2", avatarVec: vec(0.99, 0.01), style: "anime" },
        { id: "character_b1", avatarVec: vec(0, 1), style: "painterly" },
        { id: "character_b2", avatarVec: vec(0.01, 0.99), style: "painterly" },
      ];
      for (const row of reversed ? [...family].reverse() : family) {
        await seedAvatarChar(db, { id: row.id, ownerId: owner, avatarVec: row.avatarVec, artStyle: row.style });
      }
      const archetypes = await svcFor(db).visualArchetypes(owner, 2);
      return archetypes.map((a) => `${a.label}:${String(a.size)}`);
    };

    expect(await labelsFor(false)).toEqual(await labelsFor(true));
  });
});
