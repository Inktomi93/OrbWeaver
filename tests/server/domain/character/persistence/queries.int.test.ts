// persistence/queries — owner-scoped reads + the avatar LEFT JOIN + the card parse-seam. Load-bearing: the
// ownership predicate lives in the WHERE (a non-owner read returns undefined, never another user's row);
// listOwnedCharactersWithAvatar EXCLUDES synthetic rows (invariant 3); detailOf surfaces the joined avatar
// hash; cardOf degrades a corrupt JSON column to its safe default. Internal (non-front-door) files are
// imported by RELATIVE path — the package `./*` map only resolves a directory front door, not a flat file.

import { characters } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import {
  cardOf,
  detailOf,
  findByOwnerHandle,
  listOwnedCharactersWithAvatar,
  listOwnerHandles,
  loadOwnedCharacterRow,
  loadOwnedCharacterWithAvatar,
  summaryOf,
} from "../../../../../packages/server/src/domain/character/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedAsset, seedRawCharacter, seedUser } from "../_support.ts";

describe("persistence/queries", () => {
  test("loadOwnedCharacterRow is owner-scoped (undefined for a foreign row)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const id = await seedRawCharacter(db, { id: "character_x", ownerId: owner, handle: "x" });

    expect(await loadOwnedCharacterRow(db, owner, id)).toBeDefined();
    expect(await loadOwnedCharacterRow(db, other, id)).toBeUndefined();
  });

  test("loadOwnedCharacterWithAvatar surfaces the joined avatar hash", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { ownerId: owner, hash: "avhash" });
    const id = await seedRawCharacter(db, {
      id: "character_a",
      ownerId: owner,
      handle: "a",
      avatarAssetId: avatar,
    });
    const row = await loadOwnedCharacterWithAvatar(db, owner, id);
    if (row === undefined) {
      throw new Error("expected the owned row");
    }
    expect(detailOf(row).avatarHash).toBe("avhash");
  });

  test("listOwnedCharactersWithAvatar excludes synthetic rows and other owners", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    await seedRawCharacter(db, { id: "character_real", ownerId: owner, handle: "real" });
    await seedRawCharacter(db, {
      id: "character_grp",
      ownerId: owner,
      handle: "__group__c1",
      synthetic: true,
    });
    await seedRawCharacter(db, { id: "character_foreign", ownerId: other, handle: "foreign" });

    const rows = await listOwnedCharactersWithAvatar(db, owner);
    expect(rows.map((r) => summaryOf(r).handle)).toEqual(["real"]);
  });

  test("findByOwnerHandle + listOwnerHandles resolve per-owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, { id: "character_h", ownerId: owner, handle: "hero" });
    expect((await findByOwnerHandle(db, owner, "hero"))?.handle).toBe("hero");
    expect(await findByOwnerHandle(db, owner, "ghost")).toBeUndefined();
    expect(await listOwnerHandles(db, owner)).toEqual(["hero"]);
  });

  test("cardOf degrades a corrupt always-a-list column to [] (parse-seam)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const id = await seedRawCharacter(db, { id: "character_corrupt", ownerId: owner, handle: "c" });
    // poke a corrupt JSON value into the always-a-list `greetings` column
    await db
      .update(characters)
      .set({ greetings: castId<CharacterId>("not-an-array") as unknown as string[] })
      .where(eq(characters.id, id));
    const row = await loadOwnedCharacterRow(db, owner, id);
    if (row === undefined) {
      throw new Error("expected the owned row");
    }
    expect(cardOf(row).greetings).toEqual([]);
  });
});
