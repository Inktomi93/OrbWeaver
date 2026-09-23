// Integration: archetypes — k-means over an owner's card vectors, labelled from distilled facets (mode
// genre/tone + top tags), largest first; owner-scoped (audit #1); content-collapsed (fork copies don't
// double-count). (corpusProjection has its own mirror test: projection.int.test.ts.)

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedAsset, seedCharacter, seedCharacterEmbedding, seedUser, vec } from "../_support.ts";

async function seedSummary(db: Db, characterId: CharacterId, facets: { genre?: string; tone?: string; tags?: string[] }): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId,
    genre: facets.genre ?? null,
    tone: facets.tone ?? null,
    tags: facets.tags ?? [],
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
}

// Seed one distilled card with a card embedding at a given vector + content hash.
async function seedCard(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    embedding: Float32Array;
    contentHash?: string;
    genre?: string;
    tone?: string;
    tags?: string[];
    model?: string;
    avatarAssetId?: AssetId;
  },
): Promise<CharacterId> {
  const id = await seedCharacter(db, {
    id: args.id,
    ownerId: args.ownerId,
    name: args.id,
    ...(args.avatarAssetId !== undefined ? { avatarAssetId: args.avatarAssetId } : {}),
  });
  await seedCharacterEmbedding(db, {
    characterId: id,
    embedding: args.embedding,
    ...(args.model !== undefined ? { model: args.model } : {}),
    ...(args.contentHash !== undefined ? { contentHash: args.contentHash } : {}),
  });
  await seedSummary(db, id, {
    ...(args.genre !== undefined ? { genre: args.genre } : {}),
    ...(args.tone !== undefined ? { tone: args.tone } : {}),
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
  });
  return id;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("archetypes", () => {
  test("labels are globally unique and stable across equal-size model spaces", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_unique_labels");
    await Promise.all(
      ["model-b", "model-a"].flatMap((model) =>
        [0, 1].map((i) =>
          seedCard(db, {
            id: `${model}_${i}`,
            ownerId: owner,
            embedding: vec(1, i * 0.001),
            contentHash: `${model}_${i}`,
            genre: "fantasy",
            tone: "dark",
            model,
          }),
        ),
      ),
    );
    const first = await svcFor(db).archetypes(owner, { k: 1 });
    const second = await svcFor(db).archetypes(owner, { k: 1 });
    expect(first.map((a) => a.label)).toEqual(["dark fantasy", "dark fantasy (2)"]);
    expect(first.map((a) => a.model)).toEqual(["model-a", "model-b"]);
    expect(second).toEqual(first);
  });

  test("clusters card vectors and labels each from the dominant facets", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // Two tight groups: three "dark fantasy" cards near vec(1,0), three "wholesome romance" near vec(0,1).
    await Promise.all([
      ...Array.from({ length: 3 }, (_, i) =>
        seedCard(db, {
          id: `dark_${i}`,
          ownerId: owner,
          embedding: vec(1, i * 0.001),
          contentHash: `dark_${i}`,
          genre: "fantasy",
          tone: "dark",
          tags: ["dungeon", "curse"],
        }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        seedCard(db, {
          id: `warm_${i}`,
          ownerId: owner,
          embedding: vec(i * 0.001, 1),
          contentHash: `warm_${i}`,
          genre: "romance",
          tone: "wholesome",
          tags: ["cozy", "cottage"],
        }),
      ),
    ]);

    const arch = await svcFor(db).archetypes(owner, { k: 2 });
    expect(arch).toHaveLength(2);
    const labels = arch.map((a) => a.label).sort();
    expect(labels).toEqual(["dark fantasy", "wholesome romance"]);
    const darkCluster = arch.find((a) => a.label === "dark fantasy");
    expect(darkCluster?.size).toBe(3);
    expect(darkCluster?.topTags).toContain("dungeon");
  });

  test("content-identical cards collapse — a fork family does not skew a centroid", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // 4 byte-identical copies (same hash) + 2 distinct others → reps = 3 distinct → clusters at k=2.
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        seedCard(db, {
          id: `copy_${i}`,
          ownerId: owner,
          embedding: vec(1, 0),
          contentHash: "shared_hash",
          genre: "fantasy",
          tone: "dark",
        }),
      ),
    );
    await seedCard(db, {
      id: "other_1",
      ownerId: owner,
      embedding: vec(0, 1),
      contentHash: "h_other_1",
      genre: "romance",
    });
    await seedCard(db, {
      id: "other_2",
      ownerId: owner,
      embedding: vec(0, 1, 0.01),
      contentHash: "h_other_2",
      genre: "romance",
    });

    const arch = await svcFor(db).archetypes(owner, { k: 2 });
    // The 4 copies collapse to one rep for CLUSTERING, but all 4 members still count toward size.
    const total = arch.reduce((s, a) => s + a.size, 0);
    expect(total).toBe(6);
    const fantasy = arch.find((a) => a.genre === "fantasy");
    expect(fantasy?.size).toBe(4);
  });

  // The member display slice carries the portrait on the WIRE (issue #134). Before this field the corpus
  // surface joined every member against `discovery.portraitAlignment` for its faces — a second owner-scoped
  // read for one string the clustering read already passes over. `null` is the honest miss (no avatar, or an
  // undistilled card the facet join never reached), and the client degrades it to hue-seeded initials.
  test("members carry the card's portrait hash — null when the character has no avatar", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const asset = await seedAsset(db, "asset_face", owner);
    const faced = await seedCard(db, {
      id: "faced",
      ownerId: owner,
      embedding: vec(1, 0),
      contentHash: "h_faced",
      genre: "fantasy",
      avatarAssetId: asset,
    });
    const faceless = await seedCard(db, {
      id: "faceless",
      ownerId: owner,
      embedding: vec(0, 1),
      contentHash: "h_faceless",
      genre: "fantasy",
    });
    await seedCard(db, { id: "third", ownerId: owner, embedding: vec(0, 1, 0.01), contentHash: "h_third", genre: "fantasy" });

    const members = (await svcFor(db).archetypes(owner, { k: 1 })).flatMap((a) => a.members);
    expect(members.find((m) => m.characterId === faced)).toHaveProperty("avatarHash", "cas_asset_face");
    expect(members.find((m) => m.characterId === faceless)).toHaveProperty("avatarHash", null);
  });

  // THE DEFECT PROOF (issue #154 — owner screenshot: 327 members, every name "Unknown", every face a bare
  // "U"). Cluster MEMBERSHIP comes from `character_embeddings`, which the indexer fills on import; member
  // IDENTITY used to come from `character_summaries`, which only the distill pass fills. On a library that
  // has been indexed but not distilled — i.e. every freshly imported library — the two sets do not overlap at
  // all, so every real character was clustered and then printed as a stranger. Names and faces are card-row
  // facts and must resolve with zero distill rows in the database.
  test("an INDEXED but UN-DISTILLED card still carries its real name and portrait", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const asset = await seedAsset(db, "asset_sable", owner);
    // Deliberately NO seedSummary anywhere in this test: the un-distilled corpus, exactly as imported.
    const sable = await seedCharacter(db, { id: "sable", ownerId: owner, name: "Sable", avatarAssetId: asset });
    await seedCharacterEmbedding(db, { characterId: sable, embedding: vec(1, 0), contentHash: "h_sable" });
    const morgatha = await seedCharacter(db, { id: "morgatha", ownerId: owner, name: "Morgatha" });
    await seedCharacterEmbedding(db, { characterId: morgatha, embedding: vec(0, 1), contentHash: "h_morgatha" });
    const third = await seedCharacter(db, { id: "third", ownerId: owner, name: "Ilse" });
    await seedCharacterEmbedding(db, { characterId: third, embedding: vec(0, 1, 0.01), contentHash: "h_third" });

    const members = (await svcFor(db).archetypes(owner, { k: 1 })).flatMap((a) => a.members);
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.name).sort()).toEqual(["Ilse", "Morgatha", "Sable"]);
    expect(members.find((m) => m.characterId === sable)).toHaveProperty("avatarHash", "cas_asset_sable");
    expect(members.find((m) => m.characterId === morgatha)).toHaveProperty("avatarHash", null);
  });

  test("a foreign owner sees no archetypes (audit #1)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        seedCard(db, {
          id: `c_${i}`,
          ownerId: owner,
          embedding: vec(1, i * 0.001),
          contentHash: `c_${i}`,
          genre: "fantasy",
        }),
      ),
    );
    expect(await svcFor(db).archetypes(other, { k: 1 })).toEqual([]);
  });
});
