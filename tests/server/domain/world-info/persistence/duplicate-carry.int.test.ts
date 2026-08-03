// Mirror int-test for domain/world-info/persistence/createCopyCharacterBooks (PD-141) — the world-info-OWNED
// character_books CARRY that character.duplicate consumes as an injected op. REFERENCE-carry over a real db:
// the SAME world_books are re-pointed at the new character id (fresh junction rows, roles preserved); the
// books themselves are NEVER cloned; the source's own junctions are untouched; zero attachments = no-op.

import type { WorldBookRole } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, worldBooks } from "@orb/db";
import type { CharacterId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createCopyCharacterBooks } from "../../../../../packages/server/src/domain/world-info/persistence/duplicate-carry.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;

async function seedAttachedBook(
  db: Db,
  args: { readonly bookId: string; readonly ownerId: UserId; readonly characterId: CharacterId; readonly role: WorldBookRole },
): Promise<WorldBookId> {
  const bookId = castId<WorldBookId>(args.bookId);
  await db.insert(worldBooks).values({ id: bookId, ownerId: args.ownerId, name: args.bookId, description: null, createdAt: NOW });
  await db.insert(characterBooks).values({ characterId: args.characterId, worldBookId: bookId, role: args.role, createdAt: NOW });
  return bookId;
}

function junctionsFor(db: Db, characterId: CharacterId): Promise<{ worldBookId: WorldBookId; role: string }[]> {
  return db
    .select({ worldBookId: characterBooks.worldBookId, role: characterBooks.role })
    .from(characterBooks)
    .where(eq(characterBooks.characterId, characterId));
}

describe("createCopyCharacterBooks", () => {
  test("re-points the source's attached books at the target (same books, roles preserved, source untouched)", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const from = (await seedCharacter(db, { ownerId: owner })).id;
    const to = (await seedCharacter(db, { ownerId: owner })).id;
    const primary = await seedAttachedBook(db, { bookId: "world_book_primary", ownerId: owner, characterId: from, role: "primary" });
    const aux = await seedAttachedBook(db, { bookId: "world_book_aux", ownerId: owner, characterId: from, role: "auxiliary" });

    await createCopyCharacterBooks({ db, now: (): number => NOW })({ ownerId: owner, fromCharacterId: from, toCharacterId: to });

    expect(new Set(await junctionsFor(db, to))).toEqual(
      new Set([
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ]),
    );
    // The books themselves are NOT cloned.
    const books = await db.select({ id: worldBooks.id }).from(worldBooks);
    expect(books.map((b) => b.id).sort()).toEqual([aux, primary].sort());
    // The source's own junctions are untouched.
    expect(new Set(await junctionsFor(db, from))).toEqual(
      new Set([
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ]),
    );
  });

  // The OWNED-SOURCE GATE: the op re-checks tenancy itself instead of inheriting `duplicate`'s discipline.
  // A stranger's source carries NOTHING — otherwise naming a foreign characterId re-points that stranger's
  // world_books onto a card the caller owns, i.e. reads their lore through the duplicate path.
  test("a FOREIGN source character carries nothing (the ownerId gate, not the call site's discipline)", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const stranger = (await seedUser(db, {})).id;
    const foreign = (await seedCharacter(db, { ownerId: stranger })).id;
    const mine = (await seedCharacter(db, { ownerId: owner })).id;
    await seedAttachedBook(db, { bookId: "world_book_theirs", ownerId: stranger, characterId: foreign, role: "primary" });

    await createCopyCharacterBooks({ db, now: (): number => NOW })({ ownerId: owner, fromCharacterId: foreign, toCharacterId: mine });

    expect(await junctionsFor(db, mine)).toEqual([]);
  });

  // The other end of the same gate: an owned source may not be carried onto a card the caller does not own.
  test("a FOREIGN target character receives nothing", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const stranger = (await seedUser(db, {})).id;
    const mine = (await seedCharacter(db, { ownerId: owner })).id;
    const theirs = (await seedCharacter(db, { ownerId: stranger })).id;
    await seedAttachedBook(db, { bookId: "world_book_mine", ownerId: owner, characterId: mine, role: "primary" });

    await createCopyCharacterBooks({ db, now: (): number => NOW })({ ownerId: owner, fromCharacterId: mine, toCharacterId: theirs });

    expect(await junctionsFor(db, theirs)).toEqual([]);
  });

  test("a source with zero attached books is a no-op (no junction rows, no books)", async () => {
    const db = await freshDb();
    const owner = (await seedUser(db, {})).id;
    const from = (await seedCharacter(db, { ownerId: owner })).id;
    const to = (await seedCharacter(db, { ownerId: owner })).id;

    await createCopyCharacterBooks({ db, now: (): number => NOW })({ ownerId: owner, fromCharacterId: from, toCharacterId: to });

    expect(await junctionsFor(db, to)).toEqual([]);
    expect(await db.select().from(worldBooks)).toEqual([]);
  });
});
