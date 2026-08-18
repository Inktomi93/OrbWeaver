// Integration: the distill card-text read — the flat `characters` card source (D28) the distill pass
// summarizes. Load-bearing: SYNTHETIC group characters are excluded (no real card); the composed text carries
// the human-authored fields; the optional characterId/ownerId filter narrows the scan (the on-demand +
// owner-scope belts).

import { describe } from "vitest";
import { readCardDistillTargets, readOwnedCardDisplay } from "../../../../../packages/server/src/domain/discovery/persistence/card-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedCharacter, seedUser } from "../_support.ts";

describe("readCardDistillTargets", () => {
  test("reads non-synthetic cards, composes the card text, and excludes synthetic group characters", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const real = await seedCharacter(db, {
      id: "character_real",
      ownerId: owner,
      name: "Wren",
      description: "A sky cartographer who maps the last uncharted clouds.",
    });
    await seedCharacter(db, { id: "character_group", ownerId: owner, synthetic: true });

    const targets = await readCardDistillTargets(db);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.characterId).toBe(real);
    expect(targets[0]?.ownerId).toBe(owner);
    expect(targets[0]?.text).toContain("Name: Wren");
    expect(targets[0]?.text).toContain("A sky cartographer");
  });

  test("narrows to one owned character with the characterId + ownerId filter (owner-scope belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    await seedCharacter(db, { id: "character_theirs", ownerId: other, name: "Theirs" });

    // The right owner + id → one row.
    const owned = await readCardDistillTargets(db, { characterId: mine, ownerId: owner });
    expect(owned.map((t) => t.characterId)).toEqual([mine]);

    // A foreign owner filter on my character → no row (the owner-scope belt for the on-demand path).
    const foreign = await readCardDistillTargets(db, { characterId: mine, ownerId: other });
    expect(foreign).toHaveLength(0);
  });
});

// The IDENTITY read the embedding-driven views dress themselves from (issue #154). Load-bearing: it covers
// UN-DISTILLED cards — that is the whole reason it is not `summary-reads.readOwnedCardFacets`, which is rooted
// at `character_summaries` and could only ever name the distilled subset.
describe("readOwnedCardDisplay", () => {
  test("names every owned card including un-distilled ones, with its avatar hash, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const avatar = await seedAsset(db, "asset_wren", owner);
    const faced = await seedCharacter(db, { id: "character_faced", ownerId: owner, name: "Wren", avatarAssetId: avatar });
    // No `character_summaries` row anywhere in this test: a freshly imported, never-distilled library.
    const faceless = await seedCharacter(db, { id: "character_faceless", ownerId: owner, name: "Nyx" });
    await seedCharacter(db, { id: "character_foreign", ownerId: other, name: "Theirs" });
    // Synthetic (per-room group) characters carry no card and never enter a cluster.
    await seedCharacter(db, { id: "character_group", ownerId: owner, name: "group", synthetic: true });

    const rows = await readOwnedCardDisplay(db, owner);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.characterId === faced)).toMatchObject({ name: "Wren", avatarHash: "cas_asset_wren" });
    expect(rows.find((r) => r.characterId === faceless)).toMatchObject({ name: "Nyx", avatarHash: null });
  });
});
