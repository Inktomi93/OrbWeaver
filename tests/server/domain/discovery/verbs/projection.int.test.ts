// Integration: PD-40 corpusProjection — a 2D PCA of the owner's card embeddings (the "corpus galaxy"),
// labelled name + genre; owner-scoped (audit #1); fewer than 3 cards → [].

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  FROZEN_AT,
  makeDiscoveryHarness,
  seedCharacter,
  seedCharacterEmbedding,
  seedUser,
  vec,
} from "../_support.ts";

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
