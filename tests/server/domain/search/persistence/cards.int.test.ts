// persistence/cards — the lexical-engine card-field read. Asserts the owner belt against a real db: only
// the owner's cards are loaded (the BM25 corpus can never cross owners), and the searchable text fields are
// projected.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { loadCardFields } from "../../../../../packages/server/src/domain/search/persistence/cards.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedUser } from "../_support.ts";

describe("loadCardFields", () => {
  test("loads only the owner's cards with their text fields", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("cards_owner") });
    const other = await seedUser(db, { handle: castId<Handle>("cards_other") });
    await seedCharacter(db, {
      id: "character_mine",
      ownerId: owner,
      name: "Nyx",
      description: "a shadow witch",
    });
    await seedCharacter(db, { id: "character_theirs", ownerId: other, name: "Theirs" });

    const rows = await loadCardFields(db, owner);

    expect(rows.map((r) => r.id)).toEqual(["character_mine"]);
    expect(rows[0]?.name).toBe("Nyx");
    expect(rows[0]?.description).toBe("a shadow witch");
  });

  test("returns an empty corpus for an owner with no cards", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("cards_empty") });

    const rows = await loadCardFields(db, owner);

    expect(rows).toEqual([]);
  });
});
