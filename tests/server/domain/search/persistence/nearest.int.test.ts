// persistence/nearest — the raw vector_distance_cos scan (the ONE site that SQL appears). Asserts the two
// WHERE-clause belts against a real libSQL db: WITHIN-SPACE (a row in a different `model` space is never
// returned) and OWNER-SCOPE (another owner's card is never returned), plus ascending-by-distance ordering
// and the rerankable `sourceText` (name + description).

import { describe, expect, test } from "vitest";
import { nearestCharacters } from "../../../../../packages/server/src/domain/search/persistence/nearest.ts";
import { freshDb } from "../../../../support/db.ts";
import { EMBED_MODEL, seedCharacter, seedCharacterEmbedding, seedUser, vec } from "../_support.ts";

describe("nearestCharacters", () => {
  test("returns the owner's in-space cards ordered ascending by distance", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });

    const near = await seedCharacter(db, { id: "character_near", ownerId: owner, name: "Near" });
    const far = await seedCharacter(db, { id: "character_far", ownerId: owner, name: "Far" });
    await seedCharacterEmbedding(db, { characterId: near, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: far, embedding: vec(0, 1) });

    const rows = await nearestCharacters(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: EMBED_MODEL,
      limit: 10,
    });

    expect(rows.map((r) => r.characterId)).toEqual([near, far]);
    expect(rows[0]?.distance).toBeLessThan(rows[1]?.distance ?? Number.POSITIVE_INFINITY);
  });

  test("never returns a row from a different embedding space (model filter)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const inSpace = await seedCharacter(db, { id: "character_in", ownerId: owner, name: "In" });
    const otherSpace = await seedCharacter(db, {
      id: "character_other",
      ownerId: owner,
      name: "Other",
    });
    await seedCharacterEmbedding(db, { characterId: inSpace, embedding: vec(1) });
    await seedCharacterEmbedding(db, {
      characterId: otherSpace,
      embedding: vec(1),
      model: "a-different-space-model",
    });

    const rows = await nearestCharacters(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: EMBED_MODEL,
      limit: 10,
    });

    expect(rows.map((r) => r.characterId)).toEqual([inSpace]);
  });

  test("never returns another owner's card (owner-scope belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    await seedCharacterEmbedding(db, { characterId: mine, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: theirs, embedding: vec(1) });

    const rows = await nearestCharacters(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: EMBED_MODEL,
      limit: 10,
    });

    expect(rows.map((r) => r.characterId)).toEqual([mine]);
  });

  test("sourceText is the card name + description (the cross-encoder document)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const c = await seedCharacter(db, {
      id: "character_text",
      ownerId: owner,
      name: "Nyx",
      description: "a shadow witch",
    });
    await seedCharacterEmbedding(db, { characterId: c, embedding: vec(1) });

    const rows = await nearestCharacters(db, {
      ownerId: owner,
      queryVector: vec(1),
      model: EMBED_MODEL,
      limit: 10,
    });

    expect(rows[0]?.sourceText).toBe("Nyx a shadow witch");
  });
});
