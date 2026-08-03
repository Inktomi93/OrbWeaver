// Mirror int-test for domain/world-info/persistence/createLinkCarriedBooks (PD-144) — the world-info-OWNED
// character_books RE-LINK that character IMPORT consumes as an injected op. REFERENCE-carry over a real db:
// a carried `{worldBookId, role}` links ONLY when a world_book with that id EXISTS and is OWNED by the
// importing user (the owned-source gate — the cross-tenant-leak guard); an absent/foreign id is skipped and
// counted. Roles are preserved; the books themselves are NEVER cloned; the re-link is PK-collision-safe.

import type { Db } from "@orb/db";
import { characterBooks, worldBooks } from "@orb/db";
import type { CharacterId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createLinkCarriedBooks } from "../../../../../packages/server/src/domain/world-info/persistence/link-carried-books.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;

async function seedBook(db: Db, id: string, ownerId: UserId): Promise<WorldBookId> {
  const bookId = castId<WorldBookId>(id);
  await db.insert(worldBooks).values({ id: bookId, ownerId, name: id, description: null, createdAt: NOW });
  return bookId;
}

function junctionsFor(db: Db, characterId: CharacterId): Promise<{ worldBookId: WorldBookId; role: string }[]> {
  return db
    .select({ worldBookId: characterBooks.worldBookId, role: characterBooks.role })
    .from(characterBooks)
    .where(eq(characterBooks.characterId, characterId));
}

const link = (db: Db): ReturnType<typeof createLinkCarriedBooks> => createLinkCarriedBooks({ db, now: (): number => NOW });

describe("createLinkCarriedBooks", () => {
  test("links the owner's books (roles preserved) and reports them; books are not cloned", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const character = (await seedCharacter(db, { ownerId: owner })).id;
    const primary = await seedBook(db, "world_book_primary", owner);
    const aux = await seedBook(db, "world_book_aux", owner);

    const result = await link(db)({
      ownerId: owner,
      characterId: character,
      refs: [
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ],
    });

    expect(result).toEqual({ linked: 2, skipped: 0 });
    expect(new Set(await junctionsFor(db, character))).toEqual(
      new Set([
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ]),
    );
    // No new books were minted — the same two ids are all that exist.
    const books = await db.select({ id: worldBooks.id }).from(worldBooks);
    expect(books.map((b) => b.id).sort()).toEqual([aux, primary].sort());
  });

  test("skips a reference whose book id does not exist (reported, not linked)", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const character = (await seedCharacter(db, { ownerId: owner })).id;
    const real = await seedBook(db, "world_book_real", owner);
    const ghost = castId<WorldBookId>("world_book_ghost");

    const result = await link(db)({
      ownerId: owner,
      characterId: character,
      refs: [
        { worldBookId: real, role: "auxiliary" },
        { worldBookId: ghost, role: "primary" },
      ],
    });

    expect(result).toEqual({ linked: 1, skipped: 1 });
    expect(await junctionsFor(db, character)).toEqual([{ worldBookId: real, role: "auxiliary" }]);
  });

  test("LEAK GUARD: a book owned by ANOTHER user is never linked (cross-tenant)", async () => {
    const db = await freshDb();
    const importer = (await seedUser(db, { id: castId<UserId>("user_importer"), handle: castId("importer") })).id;
    const stranger = (await seedUser(db, { id: castId<UserId>("user_stranger"), handle: castId("stranger") })).id;
    const character = (await seedCharacter(db, { ownerId: importer })).id;
    // The carried id points at a REAL book — but it belongs to a different tenant.
    const strangersBook = await seedBook(db, "world_book_stranger", stranger);

    const result = await link(db)({
      ownerId: importer,
      characterId: character,
      refs: [{ worldBookId: strangersBook, role: "primary" }],
    });

    expect(result).toEqual({ linked: 0, skipped: 1 });
    // The importer's character got ZERO junctions — no cross-tenant attach.
    expect(await junctionsFor(db, character)).toEqual([]);
  });

  test("is PK-collision-safe: a re-link onto an already-linked character is idempotent", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const character = (await seedCharacter(db, { ownerId: owner })).id;
    const book = await seedBook(db, "world_book_dup", owner);
    const refs = [{ worldBookId: book, role: "primary" as const }];

    await link(db)({ ownerId: owner, characterId: character, refs });
    // Second run: the (characterId, worldBookId) PK already exists — onConflictDoNothing, no throw, no dup.
    const second = await link(db)({ ownerId: owner, characterId: character, refs });

    expect(second.linked).toBe(1);
    expect(await junctionsFor(db, character)).toEqual([{ worldBookId: book, role: "primary" }]);
  });

  test("no references is a no-op (no junctions, no query surprises)", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const character = (await seedCharacter(db, { ownerId: owner })).id;

    expect(await link(db)({ ownerId: owner, characterId: character, refs: [] })).toEqual({ linked: 0, skipped: 0 });
    expect(await junctionsFor(db, character)).toEqual([]);
  });
});
