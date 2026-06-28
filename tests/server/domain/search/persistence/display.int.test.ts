// persistence/display — the display-enrichment JOINs. Asserts against a real db: the facets come off
// `character_summaries` + the avatar hash off `assets`; a card with NO summary yields null facets (LEFT
// join); a card with no avatar yields a null hash; and the enrichment is owner-scoped (a crafted id list
// can't read another owner's card).

import { describe, expect, test } from "vitest";
import { resolveCharacterDisplay } from "../../../../../packages/server/src/domain/search/persistence/display.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedAsset, seedCharacter, seedCharacterSummary, seedUser } from "../_support.ts";

describe("resolveCharacterDisplay", () => {
  test("enriches with summary facets + the avatar CAS hash", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { id: "asset_av", ownerId: owner, hash: "avhash" });
    const c = await seedCharacter(db, {
      id: "character_full",
      ownerId: owner,
      name: "Nyx",
      avatarAssetId: avatar,
    });
    await seedCharacterSummary(db, {
      characterId: c,
      genre: "noir",
      tone: "brooding",
      elevatorPitch: "a shadow witch",
    });

    const rows = await resolveCharacterDisplay(db, owner, [c]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.name).toBe("Nyx");
    expect(row?.avatarHash).toBe("avhash");
    expect(row?.genre).toBe("noir");
    expect(row?.tone).toBe("brooding");
    expect(row?.elevatorPitch).toBe("a shadow witch");
  });

  test("a card with no summary + no avatar yields null facets + null hash", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const c = await seedCharacter(db, { id: "character_bare", ownerId: owner, name: "Bare" });

    const rows = await resolveCharacterDisplay(db, owner, [c]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.avatarHash).toBeNull();
    expect(rows[0]?.genre).toBeNull();
    expect(rows[0]?.tone).toBeNull();
    expect(rows[0]?.elevatorPitch).toBeNull();
  });

  test("never resolves another owner's card (owner-scope belt)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });

    const rows = await resolveCharacterDisplay(db, owner, [theirs]);
    expect(rows).toEqual([]);
  });

  test("an empty id list short-circuits to an empty result", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    expect(await resolveCharacterDisplay(db, owner, [])).toEqual([]);
  });
});
