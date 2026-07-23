// persistence/queries — owner-scoped reads + the avatar LEFT JOIN + the card parse-seam. Load-bearing: the
// ownership predicate lives in the WHERE (a non-owner read returns undefined, never another user's row);
// listOwnedCharactersWithAvatar EXCLUDES synthetic rows (invariant 3); detailOf surfaces the joined avatar
// hash; cardOf degrades a corrupt JSON column to its safe default. Internal (non-front-door) files are
// imported by RELATIVE path — the package `./*` map only resolves a directory front door, not a flat file.

import type { CharacterListCursor } from "@orb/contracts/character";
import { characters, characterTags, tags } from "@orb/db";
import type { CharacterId, TagId, UserId } from "@orb/kit/ids";
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
import { seedAsset, seedCharacterStats, seedCharacterSummary, seedRawCharacter, seedUser } from "../_support.ts";

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

    const rows = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "recent",
      cursor: undefined,
    });
    expect(rows.map((r) => summaryOf(r, []).handle)).toEqual(["real"]);
  });

  test("summaryOf projects the FIX-#2 denorms (elevatorPitch + lastChattedAt), null when the JOINs miss", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const withDenorms = await seedRawCharacter(db, {
      id: "character_d",
      ownerId: owner,
      handle: "d",
    });
    await seedRawCharacter(db, { id: "character_bare", ownerId: owner, handle: "bare" });
    await seedCharacterSummary(db, {
      characterId: withDenorms,
      elevatorPitch: "A wandering bard.",
    });
    await seedCharacterStats(db, { characterId: withDenorms, lastActivityAt: 1_800_000_000_000 });

    const rows = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "recent",
      cursor: undefined,
    });
    const byHandle = new Map(rows.map((r) => [r.character.handle, summaryOf(r, [])]));
    expect(byHandle.get("d")?.elevatorPitch).toBe("A wandering bard.");
    expect(byHandle.get("d")?.lastChattedAt).toBe(1_800_000_000_000);
    // No summary/stats row → both denorms are null (LEFT JOIN miss).
    expect(byHandle.get("bare")?.elevatorPitch).toBeNull();
    expect(byHandle.get("bare")?.lastChattedAt).toBeNull();
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
      .set({ greetings: castId<CharacterId>("not-an-array") as unknown as { text: string }[] })
      .where(eq(characters.id, id));
    const row = await loadOwnedCharacterRow(db, owner, id);
    if (row === undefined) {
      throw new Error("expected the owned row");
    }
    expect(cardOf(row).greetings).toEqual([]);
  });
});

describe("listOwnedCharactersWithAvatar — recent sort (lastActivityAt DESC NULLS-LAST, createdAt, id)", () => {
  // Build 4 rows: two chatted (distinct lastActivityAt), two never-chatted (null → the tail, ordered by
  // createdAt DESC, id DESC). Expected recent order: chattedNew, chattedOld, then the null tail newest-first.
  async function seedRecent(db: Awaited<ReturnType<typeof freshDb>>): Promise<UserId> {
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, {
      id: "character_hot",
      ownerId: owner,
      handle: "hot",
      createdAt: 10,
    });
    await seedRawCharacter(db, {
      id: "character_warm",
      ownerId: owner,
      handle: "warm",
      createdAt: 20,
    });
    await seedRawCharacter(db, { id: "character_n1", ownerId: owner, handle: "n1", createdAt: 30 });
    await seedRawCharacter(db, { id: "character_n2", ownerId: owner, handle: "n2", createdAt: 40 });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_hot"),
      lastActivityAt: 9000,
    });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_warm"),
      lastActivityAt: 5000,
    });
    // A stats row that EXISTS but has never chatted (lastActivityAt null) must sort into the null tail, same
    // as no stats row at all.
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_n1"),
      lastActivityAt: null,
    });
    return owner;
  }

  test("chatted rows rank by lastActivityAt DESC; never-chatted sink to the createdAt-DESC tail", async () => {
    const db = await freshDb();
    const owner = await seedRecent(db);
    const rows = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "recent",
      cursor: undefined,
    });
    // hot(9000) > warm(5000) > [null tail: n2(createdAt 40) > n1(createdAt 30)].
    expect(rows.map((r) => r.character.handle)).toEqual(["hot", "warm", "n2", "n1"]);
  });

  test("a non-null cursor pages into the null tail across the boundary", async () => {
    const db = await freshDb();
    const owner = await seedRecent(db);
    // Boundary = the "warm" row (lastChattedAt 5000). Strictly after it: the whole null tail (n2, n1).
    const cursor: CharacterListCursor = {
      sort: "recent",
      lastChattedAt: 5000,
      createdAt: 20,
      id: castId<CharacterId>("character_warm"),
    };
    const rows = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "recent",
      cursor,
    });
    expect(rows.map((r) => r.character.handle)).toEqual(["n2", "n1"]);
  });

  test("a null-boundary cursor stays WITHIN the null tail (never re-emits a non-null row)", async () => {
    const db = await freshDb();
    const owner = await seedRecent(db);
    // Boundary = the null row "n2" (createdAt 40). Only further null rows remain: n1. No non-null row leaks
    // back (they all rank ABOVE the null tail).
    const cursor: CharacterListCursor = {
      sort: "recent",
      lastChattedAt: null,
      createdAt: 40,
      id: castId<CharacterId>("character_n2"),
    };
    const rows = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "recent",
      cursor,
    });
    expect(rows.map((r) => r.character.handle)).toEqual(["n1"]);
  });

  test("honors limit and the derived next cursor pages the remainder exactly once", async () => {
    const db = await freshDb();
    const owner = await seedRecent(db);
    const first = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 2,
      sort: "recent",
      cursor: undefined,
    });
    expect(first.map((r) => r.character.handle)).toEqual(["hot", "warm"]);
    const boundary = first.at(-1);
    if (boundary === undefined) {
      throw new Error("expected a boundary row");
    }
    const cursor: CharacterListCursor = {
      sort: "recent",
      lastChattedAt: boundary.lastChattedAt,
      createdAt: boundary.character.createdAt,
      id: boundary.character.id,
    };
    const second = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 2,
      sort: "recent",
      cursor,
    });
    expect(second.map((r) => r.character.handle)).toEqual(["n2", "n1"]);
  });

  test("a TIE on lastActivityAt with the page boundary between the two rows: no skip, no dup", async () => {
    // Two rows share an IDENTICAL lastActivityAt — the exact case cross-device recency now produces at scale
    // (two characters chatted in the same tick). The keyset MUST break the tie deterministically (createdAt
    // DESC, then id DESC), so a page boundary landing BETWEEN them emits each exactly once.
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, {
      id: "character_tieA",
      ownerId: owner,
      handle: "tieA",
      createdAt: 100,
    });
    await seedRawCharacter(db, {
      id: "character_tieB",
      ownerId: owner,
      handle: "tieB",
      createdAt: 200,
    });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_tieA"),
      lastActivityAt: 7000,
    });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_tieB"),
      lastActivityAt: 7000,
    });

    // Page 1 (limit 1): the tiebreak (createdAt DESC) ranks tieB (200) before tieA (100).
    const first = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 1,
      sort: "recent",
      cursor: undefined,
    });
    expect(first.map((r) => r.character.handle)).toEqual(["tieB"]);
    const boundary = first[0];
    if (boundary === undefined) {
      throw new Error("expected a boundary row");
    }
    expect(boundary.lastChattedAt).toBe(7000);

    // Page 2 from the tieB boundary: tieA (the SAME lastActivityAt) must appear exactly once — the keyset's
    // (createdAt, id) tiebreak carries across the equal-activity boundary, so tieB is not re-emitted (no dup)
    // and tieA is not skipped.
    const cursor: CharacterListCursor = {
      sort: "recent",
      lastChattedAt: boundary.lastChattedAt,
      createdAt: boundary.character.createdAt,
      id: boundary.character.id,
    };
    const second = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "recent",
      cursor,
    });
    expect(second.map((r) => r.character.handle)).toEqual(["tieA"]);
  });
});

describe("listOwnedCharactersWithAvatar — alpha sort (name ASC, id ASC)", () => {
  test("orders by name; a name tie is broken by id ASC; the cursor excludes at-or-before the boundary", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    // Two rows share the name "Bo" — name alone can't order them; id ASC does.
    await seedRawCharacter(db, { id: "character_1", ownerId: owner, handle: "a", name: "Ada" });
    await seedRawCharacter(db, { id: "character_2", ownerId: owner, handle: "b1", name: "Bo" });
    await seedRawCharacter(db, { id: "character_3", ownerId: owner, handle: "b2", name: "Bo" });
    await seedRawCharacter(db, { id: "character_4", ownerId: owner, handle: "c", name: "Cy" });

    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "alpha",
      cursor: undefined,
    });
    expect(all.map((r) => r.character.name)).toEqual(["Ada", "Bo", "Bo", "Cy"]);
    // The two "Bo" rows are ordered character_2 then character_3 (id ASC).
    expect(all.map((r) => r.character.id)).toEqual(["character_1", "character_2", "character_3", "character_4"]);

    // Cursor = the first "Bo" (character_2) → strictly after: the second "Bo" (same name, higher id), then Cy.
    const cursor: CharacterListCursor = {
      sort: "alpha",
      name: "Bo",
      id: castId<CharacterId>("character_2"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "alpha",
      cursor,
    });
    expect(page.map((r) => r.character.id)).toEqual(["character_3", "character_4"]);
  });
});

describe("listOwnedCharactersWithAvatar — starred sort (starred DESC, then the alpha keyset)", () => {
  test("starred rows lead (alpha within each group); the cursor pages across the starred boundary", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, { id: "character_s1", ownerId: owner, name: "Zed", starred: true });
    await seedRawCharacter(db, { id: "character_s2", ownerId: owner, name: "Ann", starred: true });
    await seedRawCharacter(db, { id: "character_u1", ownerId: owner, name: "Bea", starred: false });

    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "starred",
      cursor: undefined,
    });
    // Starred group first, alpha within it (Ann, Zed), then the unstarred (Bea).
    expect(all.map((r) => r.character.name)).toEqual(["Ann", "Zed", "Bea"]);

    // Cursor = the last starred row "Zed" → strictly after: the LOWER starred group (Bea), crossing the
    // starred boundary (`starred < true`).
    const cursor: CharacterListCursor = {
      sort: "starred",
      starred: true,
      name: "Zed",
      id: castId<CharacterId>("character_s1"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "starred",
      cursor,
    });
    expect(page.map((r) => r.character.name)).toEqual(["Bea"]);
  });
});

describe("listOwnedCharactersWithAvatar — newest / oldest sort (createdAt, id)", () => {
  // Three rows at distinct createdAt, plus a createdAt TIE broken by id. newest = createdAt DESC (id DESC);
  // oldest = the direction-flipped twin (createdAt ASC, id ASC).
  async function seedByAge(db: Awaited<ReturnType<typeof freshDb>>): Promise<UserId> {
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, {
      id: "character_old",
      ownerId: owner,
      handle: "old",
      createdAt: 10,
    });
    await seedRawCharacter(db, {
      id: "character_mid",
      ownerId: owner,
      handle: "mid",
      createdAt: 20,
    });
    // Two rows share createdAt 30 — id tiebreak (character_tieHi > character_tieLo lexically).
    await seedRawCharacter(db, {
      id: "character_tieLo",
      ownerId: owner,
      handle: "tieLo",
      createdAt: 30,
    });
    await seedRawCharacter(db, {
      id: "character_tieHi",
      ownerId: owner,
      handle: "tieHi",
      createdAt: 30,
    });
    return owner;
  }

  test("newest orders createdAt DESC with an id-DESC tiebreak; the cursor pages after the boundary", async () => {
    const db = await freshDb();
    const owner = await seedByAge(db);
    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "newest",
      cursor: undefined,
    });
    // createdAt 30 pair first (id DESC: tieLo > tieHi lexically → tieLo leads), then mid(20), old(10).
    expect(all.map((r) => r.character.handle)).toEqual(["tieLo", "tieHi", "mid", "old"]);

    // Boundary = tieHi (createdAt 30). Strictly after in newest order: mid, old (the equal-createdAt tieLo
    // ranked ABOVE tieHi, so it is not re-emitted).
    const cursor: CharacterListCursor = {
      sort: "newest",
      createdAt: 30,
      id: castId<CharacterId>("character_tieHi"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "newest",
      cursor,
    });
    expect(page.map((r) => r.character.handle)).toEqual(["mid", "old"]);
  });

  test("oldest is the direction-flipped twin (createdAt ASC, id ASC); tie broken by id ASC", async () => {
    const db = await freshDb();
    const owner = await seedByAge(db);
    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "oldest",
      cursor: undefined,
    });
    // old(10), mid(20), then the createdAt-30 pair id ASC (tieHi < tieLo lexically → tieHi leads).
    expect(all.map((r) => r.character.handle)).toEqual(["old", "mid", "tieHi", "tieLo"]);

    // Boundary = tieHi (createdAt 30). Strictly after in oldest order: tieLo (same createdAt, higher id).
    const cursor: CharacterListCursor = {
      sort: "oldest",
      createdAt: 30,
      id: castId<CharacterId>("character_tieHi"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "oldest",
      cursor,
    });
    expect(page.map((r) => r.character.handle)).toEqual(["tieLo"]);
  });
});

describe("listOwnedCharactersWithAvatar — mostChats / fewestChats sort (chats NULLS-LAST, id)", () => {
  // Four rows: two with distinct chat counts, one with a stats row but 0 chats, one with NO stats row (the
  // join-null tail). `chats` is join-nullable (no stats row = null), so never-chatted sinks to the tail in
  // BOTH directions.
  async function seedByChats(db: Awaited<ReturnType<typeof freshDb>>): Promise<UserId> {
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, {
      id: "character_busy",
      ownerId: owner,
      handle: "busy",
      createdAt: 10,
    });
    await seedRawCharacter(db, {
      id: "character_some",
      ownerId: owner,
      handle: "some",
      createdAt: 20,
    });
    await seedRawCharacter(db, {
      id: "character_zero",
      ownerId: owner,
      handle: "zero",
      createdAt: 30,
    });
    // "none" has NO stats row → chats is join-null (the tail).
    await seedRawCharacter(db, {
      id: "character_none",
      ownerId: owner,
      handle: "none",
      createdAt: 40,
    });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_busy"),
      lastActivityAt: 9000,
      chats: 12,
    });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_some"),
      lastActivityAt: 5000,
      chats: 3,
    });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_zero"),
      lastActivityAt: null,
      chats: 0,
    });
    return owner;
  }

  test("mostChats ranks by chat count DESC; the no-stats-row card sinks to the NULLS-LAST tail", async () => {
    const db = await freshDb();
    const owner = await seedByChats(db);
    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "mostChats",
      cursor: undefined,
    });
    // busy(12) > some(3) > zero(0, has a stats row) > none(null tail).
    expect(all.map((r) => r.character.handle)).toEqual(["busy", "some", "zero", "none"]);
  });

  test("mostChats: a non-null cursor pages across the tie AND into the null tail", async () => {
    const db = await freshDb();
    const owner = await seedByChats(db);
    // Boundary = some(chatCount 3). Strictly after: zero(0), then the null tail (none).
    const cursor: CharacterListCursor = {
      sort: "mostChats",
      chatCount: 3,
      id: castId<CharacterId>("character_some"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "mostChats",
      cursor,
    });
    expect(page.map((r) => r.character.handle)).toEqual(["zero", "none"]);
  });

  test("mostChats: a null-boundary cursor stays WITHIN the null tail (no non-null row leaks back)", async () => {
    const db = await freshDb();
    const owner = await seedByChats(db);
    // Add a SECOND no-stats-row card so the null tail has an internal id-DESC order to page.
    await seedRawCharacter(db, {
      id: "character_none2",
      ownerId: owner,
      handle: "none2",
      createdAt: 50,
    });
    // Full null tail in mostChats (id DESC): none2 > none (lexical). Boundary = none2 → only `none` follows.
    const cursor: CharacterListCursor = {
      sort: "mostChats",
      chatCount: null,
      id: castId<CharacterId>("character_none2"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "mostChats",
      cursor,
    });
    expect(page.map((r) => r.character.handle)).toEqual(["none"]);
  });

  test("fewestChats is the direction-flipped twin — fewest first, null STILL last", async () => {
    const db = await freshDb();
    const owner = await seedByChats(db);
    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "fewestChats",
      cursor: undefined,
    });
    // zero(0) < some(3) < busy(12), then the null tail (none) — never-chatted is NEVER "fewest".
    expect(all.map((r) => r.character.handle)).toEqual(["zero", "some", "busy", "none"]);

    // Boundary = some(chatCount 3). Strictly after in fewestChats: busy(12), then the null tail (none).
    const cursor: CharacterListCursor = {
      sort: "fewestChats",
      chatCount: 3,
      id: castId<CharacterId>("character_some"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "fewestChats",
      cursor,
    });
    expect(page.map((r) => r.character.handle)).toEqual(["busy", "none"]);
  });

  test("a chat-count TIE with the page boundary between the two rows: no skip, no dup", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, {
      id: "character_tA",
      ownerId: owner,
      handle: "tA",
      createdAt: 100,
    });
    await seedRawCharacter(db, {
      id: "character_tB",
      ownerId: owner,
      handle: "tB",
      createdAt: 200,
    });
    // Identical chat count — id must break the tie deterministically (id DESC for mostChats).
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_tA"),
      lastActivityAt: null,
      chats: 7,
    });
    await seedCharacterStats(db, {
      characterId: castId<CharacterId>("character_tB"),
      lastActivityAt: null,
      chats: 7,
    });

    // Page 1 (limit 1): id DESC ranks tB before tA (character_tB > character_tA lexically).
    const first = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 1,
      sort: "mostChats",
      cursor: undefined,
    });
    expect(first.map((r) => r.character.handle)).toEqual(["tB"]);
    const boundary = first[0];
    if (boundary === undefined) {
      throw new Error("expected a boundary row");
    }
    expect(boundary.chatCount).toBe(7);

    // Page 2 from the tB boundary: tA (the SAME count) appears exactly once — the id tiebreak carries across
    // the equal-count boundary (tB not re-emitted, tA not skipped).
    const cursor: CharacterListCursor = {
      sort: "mostChats",
      chatCount: boundary.chatCount,
      id: boundary.character.id,
    };
    const second = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "mostChats",
      cursor,
    });
    expect(second.map((r) => r.character.handle)).toEqual(["tA"]);
  });
});

describe("listOwnedCharactersWithAvatar — largestCards / smallestCards sort (token_size, id)", () => {
  // `token_size` is notNull (no null tail). Two distinct sizes + a size TIE broken by id. largestCards =
  // token_size DESC (id DESC); smallestCards = the direction-flipped twin (token_size ASC, id ASC).
  async function seedBySize(db: Awaited<ReturnType<typeof freshDb>>): Promise<UserId> {
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, {
      id: "character_big",
      ownerId: owner,
      handle: "big",
      tokenSize: 900,
    });
    await seedRawCharacter(db, {
      id: "character_mid",
      ownerId: owner,
      handle: "mid",
      tokenSize: 400,
    });
    // Two rows share token_size 150 — id tiebreak (character_tieHi > character_tieLo lexically).
    await seedRawCharacter(db, {
      id: "character_tieLo",
      ownerId: owner,
      handle: "tieLo",
      tokenSize: 150,
    });
    await seedRawCharacter(db, {
      id: "character_tieHi",
      ownerId: owner,
      handle: "tieHi",
      tokenSize: 150,
    });
    return owner;
  }

  test("largestCards orders token_size DESC with an id-DESC tiebreak; the cursor pages the tie + remainder", async () => {
    const db = await freshDb();
    const owner = await seedBySize(db);
    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "largestCards",
      cursor: undefined,
    });
    // big(900) > mid(400) > [token_size 150 pair, id DESC: tieLo > tieHi].
    expect(all.map((r) => r.character.handle)).toEqual(["big", "mid", "tieLo", "tieHi"]);

    // Boundary = tieLo (token_size 150). Strictly after: tieHi (same size, lower id) — no skip, no dup.
    const cursor: CharacterListCursor = {
      sort: "largestCards",
      tokenSize: 150,
      id: castId<CharacterId>("character_tieLo"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "largestCards",
      cursor,
    });
    expect(page.map((r) => r.character.handle)).toEqual(["tieHi"]);
  });

  test("smallestCards is the direction-flipped twin (token_size ASC, id ASC); tie broken by id ASC", async () => {
    const db = await freshDb();
    const owner = await seedBySize(db);
    const all = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "smallestCards",
      cursor: undefined,
    });
    // [token_size 150 pair, id ASC: tieHi < tieLo], mid(400), big(900).
    expect(all.map((r) => r.character.handle)).toEqual(["tieHi", "tieLo", "mid", "big"]);

    // Boundary = tieHi (token_size 150). Strictly after: tieLo (same size, higher id), then mid, big.
    const cursor: CharacterListCursor = {
      sort: "smallestCards",
      tokenSize: 150,
      id: castId<CharacterId>("character_tieHi"),
    };
    const page = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "smallestCards",
      cursor,
    });
    expect(page.map((r) => r.character.handle)).toEqual(["tieLo", "mid", "big"]);
  });

  test("a token_size TIE with the page boundary between the two rows: no skip, no dup", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, {
      id: "character_sA",
      ownerId: owner,
      handle: "sA",
      tokenSize: 500,
    });
    await seedRawCharacter(db, {
      id: "character_sB",
      ownerId: owner,
      handle: "sB",
      tokenSize: 500,
    });

    // Page 1 (limit 1): largestCards id DESC ranks sB before sA (character_sB > character_sA lexically).
    const first = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 1,
      sort: "largestCards",
      cursor: undefined,
    });
    expect(first.map((r) => r.character.handle)).toEqual(["sB"]);
    const boundary = first[0];
    if (boundary === undefined) {
      throw new Error("expected a boundary row");
    }
    expect(boundary.character.tokenSize).toBe(500);

    // Page 2 from the sB boundary: sA (the SAME size) appears exactly once — the id tiebreak carries across
    // the equal-size boundary (sB not re-emitted, sA not skipped).
    const cursor: CharacterListCursor = {
      sort: "largestCards",
      tokenSize: boundary.character.tokenSize,
      id: boundary.character.id,
    };
    const second = await listOwnedCharactersWithAvatar(db, {
      ownerId: owner,
      limit: 10,
      sort: "largestCards",
      cursor,
    });
    expect(second.map((r) => r.character.handle)).toEqual(["sA"]);
  });
});

describe("canonicalTagsFor — the accepted-junction db-layer consumer read", () => {
  test("returns ACCEPTED tags per character (pending excluded), ordered sortOrder-then-name", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedRawCharacter(db, { id: "character_a", ownerId: owner, handle: "a" });
    const b = await seedRawCharacter(db, { id: "character_b", ownerId: owner, handle: "b" });
    const mk = async (id: string, name: string, sortOrder: number | null = null): Promise<TagId> => {
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
