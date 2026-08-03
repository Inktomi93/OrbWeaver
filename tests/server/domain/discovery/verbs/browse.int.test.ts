// Integration: the PD-40 distill READ-half — the filterable distilled catalog (`browseCharacters`) +
// the facet dropdowns (`characterFacets`). Proofs:
//   • owner isolation (audit #1) — a foreign owner sees none of another user's distilled cards.
//   • the facet filters (genre/tone/tag) + the case-insensitive `q` substring narrow in SQL.
//   • CONTENT-only — the row carries facets + card identity (name/avatar), no engagement counts.
//   • the sort axis (`recent` = collected-date desc default; `name` = card name asc).

import type { Db } from "@orb/db";
import { assets, characterSummaries, characters } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedUser } from "../_support.ts";

// Insert a distilled summary row directly (the browse read is decoupled from the distill compute; a direct
// seed keeps the filter/sort assertions independent of a scripted summarize run).
async function seedSummary(
  db: Db,
  overrides: {
    readonly characterId: CharacterId;
    readonly genre?: string;
    readonly tone?: string;
    readonly setting?: string;
    readonly tags?: string[];
    readonly elevatorPitch?: string;
  },
): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId: overrides.characterId,
    genre: overrides.genre ?? null,
    tone: overrides.tone ?? null,
    setting: overrides.setting ?? null,
    tags: overrides.tags ?? [],
    elevatorPitch: overrides.elevatorPitch ?? null,
    overview: null,
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
}

async function seedAvatarAsset(db: Db, id: string, ownerId: UserId, hash: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash,
    uploadedAt: FROZEN_AT,
  });
  return assetId;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("browseCharacters", () => {
  test("returns the owner's distilled cards with facets + identity, newest-collected first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const older = await seedCharacter(db, { id: "character_older", ownerId: owner, name: "Older" });
    const newer = await seedCharacter(db, { id: "character_newer", ownerId: owner, name: "Newer" });
    // Make `newer` the more-recently collected card + give it an avatar.
    const avatar = await seedAvatarAsset(db, "asset_av", owner, "cas_avatar_hash");
    await db
      .update(characters)
      .set({ createdAt: FROZEN_AT + 1000, avatarAssetId: avatar })
      .where(eq(characters.id, newer));

    await seedSummary(db, {
      characterId: older,
      genre: "fantasy",
      tone: "dark",
      tags: ["airships"],
      elevatorPitch: "Old hook.",
    });
    await seedSummary(db, {
      characterId: newer,
      genre: "horror",
      tone: "tense",
      tags: ["eldritch"],
      elevatorPitch: "New hook.",
    });

    const rows = await svcFor(db).browseCharacters(owner);
    expect(rows.map((r) => r.name)).toEqual(["Newer", "Older"]);
    expect(rows[0]).toMatchObject({
      name: "Newer",
      genre: "horror",
      tone: "tense",
      tags: ["eldritch"],
      avatarHash: "cas_avatar_hash",
    });
    // `Older` has no avatar → null.
    expect(rows[1]?.avatarHash).toBeNull();
  });

  test("a foreign owner sees none of another user's cards (audit #1)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const c = await seedCharacter(db, { id: "character_1", ownerId: owner, name: "Mine" });
    await seedSummary(db, { characterId: c, genre: "fantasy" });
    expect(await svcFor(db).browseCharacters(other)).toEqual([]);
  });

  test("filters by genre/tone/tag and case-insensitive q, sorts by name", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "Bravo" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "Alpha" });
    await seedSummary(db, {
      characterId: a,
      genre: "fantasy",
      tone: "dark",
      tags: ["Airships", "Sky-Pirates"],
      elevatorPitch: "Maps the sky.",
    });
    await seedSummary(db, {
      characterId: b,
      genre: "horror",
      tone: "tense",
      tags: ["eldritch"],
      elevatorPitch: "Dread below.",
    });
    const svc = svcFor(db);

    expect((await svc.browseCharacters(owner, { genre: "fantasy" })).map((r) => r.name)).toEqual(["Bravo"]);
    expect((await svc.browseCharacters(owner, { tone: "tense" })).map((r) => r.name)).toEqual(["Alpha"]);
    // exact tag membership, case-insensitive.
    expect((await svc.browseCharacters(owner, { tag: "airships" })).map((r) => r.name)).toEqual(["Bravo"]);
    // q substring over name/pitch/tags.
    expect((await svc.browseCharacters(owner, { q: "DREAD" })).map((r) => r.name)).toEqual(["Alpha"]);
    // name sort.
    expect((await svc.browseCharacters(owner, { sort: "name" })).map((r) => r.name)).toEqual(["Alpha", "Bravo"]);
    // limit caps.
    expect(await svc.browseCharacters(owner, { limit: 1 })).toHaveLength(1);
  });
});

describe("characterFacets", () => {
  test("returns distinct genres + tones with counts, descending, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    const c = await seedCharacter(db, { id: "character_c", ownerId: owner, name: "C" });
    const foreign = await seedCharacter(db, { id: "character_f", ownerId: other, name: "F" });
    await seedSummary(db, { characterId: a, genre: "fantasy", tone: "dark" });
    await seedSummary(db, { characterId: b, genre: "fantasy", tone: "tense" });
    await seedSummary(db, { characterId: c, genre: "horror", tone: "dark" });
    await seedSummary(db, { characterId: foreign, genre: "romance", tone: "wholesome" });

    const facets = await svcFor(db).characterFacets(owner);
    expect(facets.genres).toEqual([
      { value: "fantasy", count: 2 },
      { value: "horror", count: 1 },
    ]);
    expect(facets.tones).toEqual([
      { value: "dark", count: 2 },
      { value: "tense", count: 1 },
    ]);
  });
});
