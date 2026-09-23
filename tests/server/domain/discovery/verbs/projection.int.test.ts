// Integration: corpusProjection — a 2D PCA of the owner's card embeddings (the "corpus galaxy"),
// labelled name + genre; owner-scoped (audit #1); fewer than 3 cards → [].

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedCharacterEmbedding, seedUser, vec } from "../_support.ts";

async function seedCard(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    embedding: Float32Array;
    contentHash: string;
    genre?: string;
  },
): Promise<CharacterId> {
  const id = await seedCharacter(db, { id: args.id, ownerId: args.ownerId, name: args.id });
  await seedCharacterEmbedding(db, {
    characterId: id,
    embedding: args.embedding,
    contentHash: args.contentHash,
  });
  await db.insert(characterSummaries).values({
    characterId: id,
    genre: args.genre ?? null,
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
  return id;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("corpusProjection", () => {
  test("an equal-size model-space tie chooses the lexical model and returns points in stable id order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_tied_spaces");
    for (const model of ["model-b", "model-a"]) {
      for (const [i, embedding] of [vec(1, 0), vec(0, 1), vec(1, 1)].entries()) {
        const id = await seedCharacter(db, { id: `${model}_${i}`, ownerId: owner, name: `${model}_${i}` });
        await seedCharacterEmbedding(db, { characterId: id, embedding, contentHash: `${model}_${i}`, model });
      }
    }
    const points = await svcFor(db).corpusProjection(owner);
    expect(points.map((p) => p.name)).toEqual(["model-a_0", "model-a_1", "model-a_2"]);
  });

  test("projects the owner's cards to 2D with name + genre, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCard(db, {
      id: "alpha",
      ownerId: owner,
      embedding: vec(1, 0),
      contentHash: "a",
      genre: "fantasy",
    });
    await seedCard(db, { id: "beta", ownerId: owner, embedding: vec(0, 1), contentHash: "b" });
    await seedCard(db, { id: "gamma", ownerId: owner, embedding: vec(1, 1), contentHash: "g" });

    const points = await svcFor(db).corpusProjection(owner);
    expect(points).toHaveLength(3);
    const alpha = points.find((p) => p.characterId === a);
    expect(alpha).toMatchObject({ name: "alpha", genre: "fantasy" });
    expect(typeof alpha?.x).toBe("number");
    expect(typeof alpha?.y).toBe("number");
  });

  // The projection's point set is every INDEXED card, so its NAMES must resolve with zero distill rows
  // (issue #154 — the same "Unknown" wall the archetype clusters showed).
  test("un-distilled cards plot with their real names and a null genre", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const named = await seedCharacter(db, { id: "alpha", ownerId: owner, name: "Wren" });
    await seedCharacterEmbedding(db, { characterId: named, embedding: vec(1, 0), contentHash: "a" });
    const beta = await seedCharacter(db, { id: "beta", ownerId: owner, name: "Nyx" });
    await seedCharacterEmbedding(db, { characterId: beta, embedding: vec(0, 1), contentHash: "b" });
    const gamma = await seedCharacter(db, { id: "gamma", ownerId: owner, name: "Ilse" });
    await seedCharacterEmbedding(db, { characterId: gamma, embedding: vec(1, 1), contentHash: "g" });

    const points = await svcFor(db).corpusProjection(owner);
    expect(points.map((p) => p.name).sort()).toEqual(["Ilse", "Nyx", "Wren"]);
    expect(points.find((p) => p.characterId === named)).toMatchObject({ genre: null });
  });

  test("a foreign owner sees an empty galaxy (audit #1)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedCard(db, { id: "a", ownerId: owner, embedding: vec(1, 0), contentHash: "a" });
    await seedCard(db, { id: "b", ownerId: owner, embedding: vec(0, 1), contentHash: "b" });
    await seedCard(db, { id: "c", ownerId: owner, embedding: vec(1, 1), contentHash: "c" });
    expect(await svcFor(db).corpusProjection(other)).toEqual([]);
  });

  test("fewer than 3 cards yields no galaxy", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCard(db, { id: "solo", ownerId: owner, embedding: vec(1, 0), contentHash: "s" });
    await seedCard(db, { id: "duo", ownerId: owner, embedding: vec(0, 1), contentHash: "d" });
    expect(await svcFor(db).corpusProjection(owner)).toEqual([]);
  });
});
