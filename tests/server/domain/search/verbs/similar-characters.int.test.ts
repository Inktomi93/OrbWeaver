// verb: similarCharacters — "more like this character" seed-vector top-k over the card space (PD-35).
// Asserts against a real db + a scripted role-clients bundle: the scan seeds from the STORED card vector (no
// re-embed — the fake embedder is never consulted), excludes the seed itself, ranks by CSLS, enriches like
// findCharacters, and — THE LOAD-BEARING CASE — REFUSES a cross-tenant seed (a foreign/unknown seed id
// resolves to no owner-belted vector ⇒ an empty result, never another tenant's neighbourhood; neo V2-2).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeSearch, seedAsset, seedCharacter, seedCharacterEmbedding, seedCharacterSummary, seedUser, vec } from "../_support.ts";

describe("similarCharacters", () => {
  test("returns the nearest neighbours of the seed, excluding the seed itself", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const seed = await seedCharacter(db, { id: "character_seed", ownerId: owner, name: "Seed" });
    const near = await seedCharacter(db, { id: "character_near", ownerId: owner, name: "Near" });
    const far = await seedCharacter(db, { id: "character_far", ownerId: owner, name: "Far" });
    await seedCharacterEmbedding(db, { characterId: seed, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: near, embedding: vec(0.9, 0.1) });
    await seedCharacterEmbedding(db, { characterId: far, embedding: vec(0, 1) });

    // The embedder throws if consulted — similarCharacters seeds from the STORED vector, never a re-embed.
    const svc = makeSearch(db, {
      embedVector: () => {
        throw new Error("similarCharacters must not re-embed");
      },
    });
    const hits = await svc.similarCharacters({ ownerId: owner, characterId: seed, topN: 5 });

    expect(hits.map((h) => h.characterId)).toEqual([near, far]);
    expect(hits.map((h) => h.characterId)).not.toContain(seed);
  });

  test("enriches neighbours with the distilled facets + avatar hash", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { id: "asset_av", ownerId: owner, hash: "avhash" });
    const seed = await seedCharacter(db, { id: "character_seed", ownerId: owner, name: "Seed" });
    const near = await seedCharacter(db, {
      id: "character_near",
      ownerId: owner,
      name: "Near",
      avatarAssetId: avatar,
    });
    await seedCharacterEmbedding(db, { characterId: seed, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: near, embedding: vec(0.9, 0.1) });
    await seedCharacterSummary(db, {
      characterId: near,
      genre: "noir",
      tone: "brooding",
      elevatorPitch: "a shadow witch",
    });

    const svc = makeSearch(db);
    const hits = await svc.similarCharacters({ ownerId: owner, characterId: seed, topN: 5 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe("Near");
    expect(hits[0]?.avatarHash).toBe("avhash");
    expect(hits[0]?.genre).toBe("noir");
    expect(hits[0]?.elevatorPitch).toBe("a shadow witch");
  });

  test("REFUSES a cross-tenant seed — a foreign seed id yields an empty result", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    // Owner A's world (the seed + a neighbour the stranger must never reach).
    const seed = await seedCharacter(db, { id: "character_seed", ownerId: owner, name: "Seed" });
    const neighbour = await seedCharacter(db, { id: "character_nb", ownerId: owner, name: "Nb" });
    await seedCharacterEmbedding(db, { characterId: seed, embedding: vec(1) });
    await seedCharacterEmbedding(db, { characterId: neighbour, embedding: vec(0.9, 0.1) });

    const svc = makeSearch(db);
    // The stranger seeds with A's characterId — the owner-belted seed read finds nothing → empty.
    const hits = await svc.similarCharacters({
      ownerId: stranger,
      characterId: seed,
      topN: 5,
    });

    expect(hits).toEqual([]);
  });

  test("an unknown seed id yields an empty result", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const svc = makeSearch(db);

    // A well-formed but non-existent seed id — the owner-belted seed read short-circuits to empty.
    const hits = await svc.similarCharacters({
      ownerId: owner,
      characterId: castId<CharacterId>("character_missing"),
      topN: 5,
    });

    expect(hits).toEqual([]);
  });
});
