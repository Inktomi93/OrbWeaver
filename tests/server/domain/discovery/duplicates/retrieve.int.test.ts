// Integration: the owner-scoped near-duplicate CHARACTER read — name enrichment, CSLS ranking, owner
// isolation (audit #1), and the minScore/limit options.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  makeDiscoveryHarness,
  seedCharacter,
  seedCharacterEmbedding,
  seedUser,
  vec,
} from "../_support.ts";

async function seedNearDupPair(db: Db, ownerId: UserId): Promise<void> {
  const c1 = await seedCharacter(db, { id: "character_1", ownerId, name: "Aria" });
  const c2 = await seedCharacter(db, { id: "character_2", ownerId, name: "Aria Clone" });
  await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
  await seedCharacterEmbedding(db, { characterId: c2, embedding: vec(1, 0.05), contentHash: "h2" });
}

describe("duplicateCharacters", () => {
  test("returns the owner's pairs with both card names", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedNearDupPair(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();

    const pairs = await svc.duplicateCharacters(owner);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ nameA: "Aria", nameB: "Aria Clone" });
    expect(pairs[0]?.similarity ?? 0).toBeGreaterThan(0.92);
  });

  test("a foreign owner sees none of another user's pairs (audit #1)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedNearDupPair(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();

    expect(await svc.duplicateCharacters(other)).toEqual([]);
  });

  test("minScore filters and limit caps", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedNearDupPair(db, owner);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();

    expect(await svc.duplicateCharacters(owner, { minScore: 99 })).toEqual([]);
    expect(await svc.duplicateCharacters(owner, { limit: 0 })).toEqual([]);
  });
});
