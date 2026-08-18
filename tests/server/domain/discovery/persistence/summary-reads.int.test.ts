// Integration: the distilled-facet label read — `character_summaries` joined to the flat `characters` card
// for the display name + owner scope (D23 derive). Load-bearing: owner-scoped (a foreign owner's cards are
// excluded — audit #1); only DISTILLED cards appear (the innerJoin drops undistilled/synthetic characters).

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { describe } from "vitest";
import { readOwnedCardFacets } from "../../../../../packages/server/src/domain/discovery/persistence/summary-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedAsset, seedCharacter, seedUser } from "../_support.ts";

async function seedSummary(
  db: Db,
  characterId: CharacterId,
  facets: { genre?: string; tone?: string; tags?: string[]; elevatorPitch?: string },
): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId,
    genre: facets.genre ?? null,
    tone: facets.tone ?? null,
    tags: facets.tags ?? [],
    elevatorPitch: facets.elevatorPitch ?? null,
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
}

describe("readOwnedCardFacets", () => {
  test("returns the owner's distilled cards with name + facets, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const avatar = await seedAsset(db, "asset_wren", owner);
    const distilled = await seedCharacter(db, {
      id: "character_distilled",
      ownerId: owner,
      name: "Wren",
      avatarAssetId: avatar,
    });
    // An undistilled card (no summary row) must not appear.
    await seedCharacter(db, { id: "character_undistilled", ownerId: owner, name: "Nobody" });
    const foreign = await seedCharacter(db, { id: "character_foreign", ownerId: other, name: "F" });
    await seedSummary(db, distilled, {
      genre: "fantasy",
      tone: "dark",
      tags: ["airships"],
      elevatorPitch: "Maps the sky.",
    });
    await seedSummary(db, foreign, { genre: "horror" });

    const rows = await readOwnedCardFacets(db, owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      characterId: distilled,
      name: "Wren",
      genre: "fantasy",
      tone: "dark",
      tags: ["airships"],
      elevatorPitch: "Maps the sky.",
      // The portrait rides this read (issue #134): it is the row that already joins `characters` for the
      // display name, and the archetype member slice needs the face beside that name.
      avatarHash: "cas_asset_wren",
    });
  });

  test("a distilled card with no avatar reads a null portrait rather than dropping out", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // The LEFT join is the whole point — an inner one would silently delete every faceless card from the
    // archetype clusters, the projection and the similarity graph.
    const faceless = await seedCharacter(db, { id: "character_faceless", ownerId: owner, name: "Nyx" });
    await seedSummary(db, faceless, { genre: "horror" });

    const rows = await readOwnedCardFacets(db, owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Nyx", avatarHash: null });
  });
});
