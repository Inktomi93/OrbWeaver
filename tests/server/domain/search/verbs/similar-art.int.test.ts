// verb: similarArt — "more like this avatar" seed-vector top-k over the IMAGE space (PD-35). Asserts against
// a real db + a scripted role-clients bundle: image↔image ranking seeded from the character's stored avatar
// vector (no re-embed), the seed excluded, the DEFAULT lens is the pure-visual `image-raw` portrait lens,
// owner isolation, and — THE LOAD-BEARING CASE — a cross-tenant seed REFUSAL (a foreign seed id resolves to
// no owner-belted avatar vector ⇒ an empty result; neo V2-2). CSLS APPLIES here (same-space image↔image).

import type { Db } from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeSearch, seedAsset, seedCharacter, seedImageEmbedding, seedUser, vec } from "../_support.ts";

/** Seed a character whose avatar has an `image-raw` embedding at the given vector — a `similarArt` candidate. */
async function seedAvatarCharacter(
  db: Db,
  opts: {
    readonly id: string;
    readonly ownerId: UserId;
    readonly name: string;
    readonly embedding: Float32Array;
  },
): Promise<CharacterId> {
  const asset = await seedAsset(db, {
    id: `asset_${opts.id}`,
    ownerId: opts.ownerId,
    hash: `hash_${opts.id}`,
  });
  const character = await seedCharacter(db, {
    id: `character_${opts.id}`,
    ownerId: opts.ownerId,
    name: opts.name,
    avatarAssetId: asset,
  });
  await seedImageEmbedding(db, {
    id: `ie_${opts.id}`,
    assetId: asset,
    lens: "image-raw",
    embedding: opts.embedding,
  });
  return character;
}

describe("similarArt", () => {
  test("returns the visually-nearest characters, excluding the seed", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const seed = await seedAvatarCharacter(db, {
      id: "seed",
      ownerId: owner,
      name: "Seed",
      embedding: vec(1),
    });
    const near = await seedAvatarCharacter(db, {
      id: "near",
      ownerId: owner,
      name: "Near",
      embedding: vec(0.9, 0.1),
    });
    const far = await seedAvatarCharacter(db, {
      id: "far",
      ownerId: owner,
      name: "Far",
      embedding: vec(0, 1),
    });

    const svc = makeSearch(db);
    const hits = await svc.similarArt({ ownerId: owner, characterId: seed, topN: 5 });

    expect(hits.map((h) => h.characterId)).toEqual([near, far]);
    expect(hits.map((h) => h.characterId)).not.toContain(seed);
    expect(hits[0]?.name).toBe("Near");
    expect(hits[0]?.avatarHash).toBe("hash_near");
    expect(hits[0]?.lens).toBe("image-raw");
  });

  test("the default lens is image-raw — a captioned-only avatar is not scanned", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const seed = await seedAvatarCharacter(db, {
      id: "seed",
      ownerId: owner,
      name: "Seed",
      embedding: vec(1),
    });
    // A neighbour whose avatar is embedded ONLY under the captioned lens — the raw-lens scan skips it.
    const capAsset = await seedAsset(db, { id: "asset_cap", ownerId: owner, hash: "hash_cap" });
    const capChar = await seedCharacter(db, {
      id: "character_cap",
      ownerId: owner,
      name: "Cap",
      avatarAssetId: capAsset,
    });
    await seedImageEmbedding(db, {
      id: "ie_cap",
      assetId: capAsset,
      lens: "image-captioned",
      embedding: vec(0.95, 0.05),
    });

    const svc = makeSearch(db);
    const hits = await svc.similarArt({ ownerId: owner, characterId: seed, topN: 5 });

    expect(hits.map((h) => h.characterId)).not.toContain(capChar);
    expect(hits).toEqual([]);
  });

  test("never returns another owner's avatar", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const seed = await seedAvatarCharacter(db, {
      id: "seed",
      ownerId: owner,
      name: "Seed",
      embedding: vec(1),
    });
    await seedAvatarCharacter(db, {
      id: "theirs",
      ownerId: other,
      name: "Theirs",
      embedding: vec(1),
    });

    const svc = makeSearch(db);
    const hits = await svc.similarArt({ ownerId: owner, characterId: seed, topN: 5 });

    expect(hits).toEqual([]);
  });

  test("REFUSES a cross-tenant seed — a foreign seed id yields an empty result", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const seed = await seedAvatarCharacter(db, {
      id: "seed",
      ownerId: owner,
      name: "Seed",
      embedding: vec(1),
    });
    await seedAvatarCharacter(db, {
      id: "nb",
      ownerId: owner,
      name: "Nb",
      embedding: vec(0.9, 0.1),
    });

    const svc = makeSearch(db);
    // The stranger seeds with A's characterId — the owner-belted avatar seed read finds nothing → empty.
    const hits = await svc.similarArt({ ownerId: stranger, characterId: seed, topN: 5 });

    expect(hits).toEqual([]);
  });
});
