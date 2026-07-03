// persistence/queries — owner-scoped reads + the avatar LEFT JOIN + the card parse-seam. Load-bearing: the
// ownership predicate lives in the WHERE (a non-owner read returns undefined, never another user's row);
// listOwnedCharactersWithAvatar EXCLUDES synthetic rows (invariant 3); detailOf surfaces the joined avatar
// hash; cardOf degrades a corrupt JSON column to its safe default. Internal (non-front-door) files are
// imported by RELATIVE path — the package `./*` map only resolves a directory front door, not a flat file.

import { characters, characterTags, tags } from "@orb/db";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  canonicalTagsFor,
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
import { expect, test } from "../../../../support/fixtures";
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
    expect(detailOf(row, []).avatarHash).toBe("avhash");
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
    expect(rows.map((r) => summaryOf(r, []).handle)).toEqual(["real"]);
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

describe("canonicalTagsFor — the accepted-junction db-layer consumer read", () => {
  test("returns ACCEPTED tags per character (pending excluded), ordered sortOrder-then-name", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedRawCharacter(db, { id: "character_a", ownerId: owner, handle: "a" });
    const b = await seedRawCharacter(db, { id: "character_b", ownerId: owner, handle: "b" });
    const mk = async (
      id: string,
      name: string,
      sortOrder: number | null = null,
    ): Promise<TagId> => {
      const tagId = castId<TagId>(id);
      await db.insert(tags).values({ id: tagId, ownerId: owner, name, sortOrder });
      return tagId;
    };
    const zeta = await mk("tag_z", "zeta", 0); // manually ordered first despite the name
    const alpha = await mk("tag_a", "alpha");
    const pending = await mk("tag_p", "staged");
    await db.insert(characterTags).values([
      { characterId: a, tagId: alpha, status: "accepted" },
      { characterId: a, tagId: zeta, status: "accepted" },
      { characterId: a, tagId: pending, status: "pending" },
      { characterId: b, tagId: alpha, status: "accepted" },
    ]);

    const map = await canonicalTagsFor(db, [a, b]);

    // a: ordered (sortOrder 0 first, then name); the pending staged suggestion is NOT canon.
    expect(map.get(a)?.map((t) => t.name)).toEqual(["zeta", "alpha"]);
    expect(map.get(b)?.map((t) => t.name)).toEqual(["alpha"]);
    // The projection is the TagView wire shape.
    expect(map.get(b)?.at(0)).toEqual({
      id: alpha,
      name: "alpha",
      color: null,
      color2: null,
      source: null,
      folderType: "NONE",
      sortOrder: null,
      isHiddenOnCard: false,
    });
    // An empty id set is an empty map (no query).
    expect((await canonicalTagsFor(db, [])).size).toBe(0);
  });
});
