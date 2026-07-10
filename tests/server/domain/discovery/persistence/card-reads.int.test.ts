// Integration: the distill card-text read — the flat `characters` card source (D28) the distill pass
// summarizes. Load-bearing: SYNTHETIC group characters are excluded (no real card); the composed text carries
// the human-authored fields; the optional characterId/ownerId filter narrows the scan (the on-demand +
// owner-scope belts).

import { describe } from "vitest";
import { readCardDistillTargets } from "../../../../../packages/server/src/domain/discovery/persistence/card-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedUser } from "../_support.ts";

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
