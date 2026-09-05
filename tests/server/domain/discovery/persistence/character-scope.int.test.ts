// Integration: the ONE `characters` belt discovery's owner analytics wear (#1467 item 1). Proofs: the
// owner-scoped form drops BOTH a foreign owner's cards and this owner's synthetic per-room group buckets; the
// ALL-OWNERS form (the bulk passes' `ownerId: null`) drops the owner half and keeps the synthetic half.

import { characters } from "@orb/db";
import { describe } from "vitest";
import { ownedRealCharacters } from "../../../../../packages/server/src/domain/discovery/persistence/character-scope.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedUser } from "../_support.ts";

describe("ownedRealCharacters", () => {
  test("owner-scoped: keeps the owner's real cards, drops synthetic ones and other owners'", async () => {
    const db = await freshDb();
    const mine = await seedUser(db, "user_a");
    const theirs = await seedUser(db, "user_b");
    const real = await seedCharacter(db, { id: "character_real", ownerId: mine });
    await seedCharacter(db, { id: "character_group", ownerId: mine, synthetic: true });
    await seedCharacter(db, { id: "character_foreign", ownerId: theirs });

    const rows = await db.select({ id: characters.id }).from(characters).where(ownedRealCharacters(mine));

    expect(rows.map((r) => r.id)).toEqual([real]);
  });

  test("ALL-OWNERS: keeps every owner's real cards and still drops the synthetic buckets", async () => {
    const db = await freshDb();
    const mine = await seedUser(db, "user_a");
    const theirs = await seedUser(db, "user_b");
    const a = await seedCharacter(db, { id: "character_a", ownerId: mine });
    const b = await seedCharacter(db, { id: "character_b", ownerId: theirs });
    await seedCharacter(db, { id: "character_group", ownerId: mine, synthetic: true });

    const rows = await db.select({ id: characters.id }).from(characters).where(ownedRealCharacters());

    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([a, b]));
  });
});
