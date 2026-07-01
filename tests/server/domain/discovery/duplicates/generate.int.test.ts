// Integration: the near-duplicate CHARACTER pass — detection at the cosine threshold, CSLS ranking, owner +
// space scoping, synthetic exclusion, canonical A<B, and the content-hash collapse invariant (esoteric #3).

import { duplicateCharacterPairs } from "@orb/db";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
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

describe("computeDuplicatePairs", () => {
  test("records a near-duplicate pair above the cosine threshold, canonical A<B", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    // cos(vec(1,0), vec(1,0.05)) ≈ 0.9988 ≥ 0.92; distinct content hashes ⇒ no collapse.
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0.05),
      contentHash: "h2",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    const stats = await svc.computeDuplicatePairs();
    expect(stats).toMatchObject({ ownersProcessed: 1, charactersScanned: 2, pairsWritten: 1 });

    const rows = await db.select().from(duplicateCharacterPairs);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.characterIdA).toBe("character_1"); // A < B (string order)
    expect(rows[0]?.characterIdB).toBe("character_2");
    expect(rows[0]?.similarity ?? 0).toBeGreaterThan(0.92);
  });

  test("does NOT pair characters below the threshold", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    // cos(vec(1,0), vec(0.7,0.7)) ≈ 0.707 < 0.92.
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(0.7, 0.7),
      contentHash: "h2",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  test("never pairs across owners", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "user_a");
    const b = await seedUser(db, "user_b");
    const ca = await seedCharacter(db, { id: "character_a", ownerId: a });
    const cb = await seedCharacter(db, { id: "character_b", ownerId: b });
    await seedCharacterEmbedding(db, { characterId: ca, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, { characterId: cb, embedding: vec(1, 0), contentHash: "h2" });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  test("never pairs across embedding spaces", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    await seedCharacterEmbedding(db, {
      characterId: c1,
      embedding: vec(1, 0),
      contentHash: "h1",
      model: "space-one",
    });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0),
      contentHash: "h2",
      model: "space-two",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  test("excludes synthetic characters from pairing (esoteric #12)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    const synth = await seedCharacter(db, { id: "character_s", ownerId: owner, synthetic: true });
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0.05),
      contentHash: "h2",
    });
    await seedCharacterEmbedding(db, {
      characterId: synth,
      embedding: vec(1, 0),
      contentHash: "h3",
    });

    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();
    const rows = await db.select().from(duplicateCharacterPairs);
    const ids = rows.flatMap((r) => [r.characterIdA, r.characterIdB]);
    expect(ids).not.toContain(synth);
  });

  test("content-hash collapse: byte-identical copies do not inflate into pairs (esoteric #3)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // Three byte-identical copies (SAME contentHash) ⇒ collapse to one rep ⇒ no pairs among them.
    const ids = await Promise.all(
      [1, 2, 3].map((n) => seedCharacter(db, { id: `character_${n}`, ownerId: owner })),
    );
    await Promise.all(
      ids.map((c) =>
        seedCharacterEmbedding(db, { characterId: c, embedding: vec(1, 0), contentHash: "same" }),
      ),
    );
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    expect((await svc.computeDuplicatePairs()).pairsWritten).toBe(0);
  });

  test("a deleted character removes its pairs by CASCADE (D24 — no sweep)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const c1 = await seedCharacter(db, { id: "character_1", ownerId: owner });
    const c2 = await seedCharacter(db, { id: "character_2", ownerId: owner });
    await seedCharacterEmbedding(db, { characterId: c1, embedding: vec(1, 0), contentHash: "h1" });
    await seedCharacterEmbedding(db, {
      characterId: c2,
      embedding: vec(1, 0.05),
      contentHash: "h2",
    });
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();
    expect(await db.select().from(duplicateCharacterPairs)).toHaveLength(1);

    const { characters } = await import("@orb/db");
    await db.delete(characters).where(eq(characters.id, c1));
    expect(await db.select().from(duplicateCharacterPairs)).toHaveLength(0);
  });
});
