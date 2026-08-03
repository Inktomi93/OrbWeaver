// verb: duplicate — clone into a fresh local card. Load-bearing: a free `<handle>-copy[-n]` is derived,
// content is copied, import provenance is CLEARED (the clone is app-authored), character.updated emits, and
// (PD-141) the source's attached world-info book REFERENCES are CARRIED onto the clone (the books are never
// cloned — new junction rows point at the SAME books).

import type { WorldBookRole } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, worldBooks } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

/** Seed an owned world book + attach it to a character at `role` (PD-141 carry fixtures). */
async function seedAttachedBook(
  db: Db,
  args: { readonly bookId: string; readonly ownerId: UserId; readonly characterId: CharacterId; readonly role: WorldBookRole },
): Promise<WorldBookId> {
  const bookId = castId<WorldBookId>(args.bookId);
  await db.insert(worldBooks).values({ id: bookId, ownerId: args.ownerId, name: args.bookId, description: null, createdAt: FROZEN_AT_MS });
  await db.insert(characterBooks).values({ characterId: args.characterId, worldBookId: bookId, role: args.role, createdAt: FROZEN_AT_MS });
  return bookId;
}

describe("duplicate", () => {
  test("clones content under a -copy handle, fresh id, and emits character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "the original" },
    });
    h.events.length = 0;

    const copy = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    expect(copy.id).not.toBe(source.id);
    expect(copy.handle).toBe("nyx-copy");
    expect(copy.name).toBe("Nyx");
    expect(copy.description).toBe("the original");
    expect(h.events).toEqual([{ type: "character.updated", characterId: copy.id, contentChanged: true }]);
  });

  test("a second duplicate of the same source increments the copy handle", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    const first = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    const second = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    expect(first.handle).toBe("nyx-copy");
    expect(second.handle).toBe("nyx-copy-2");
  });

  test("duplicating an imported card clears the import provenance", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const imported = await seedRawCharacter(db, {
      id: "character_imp",
      ownerId: owner,
      handle: castId<CharacterHandle>("imported"),
      name: "Imported",
      importedFrom: "card.png",
      importHash: "rawfilehash",
    });
    const copy = await svc.duplicate({ principal: principal(owner), characterId: imported });
    expect(copy.handle).toBe("imported-copy");
    expect(copy.importedFrom).toBeNull();
    expect(copy.importHash).toBeNull();
  });

  test("D44 §12.1/§12.5 — the per-character theme/render policies carry forward", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    await svc.update({
      principal: principal(owner),
      characterId: source.id,
      input: { trustHtml: true, themeOverride: { accent: "oklch(0.7 0.14 250)" } },
    });
    const copy = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    expect(copy.trustHtml).toBe(true);
    expect(copy.themeOverride).toEqual({ accent: "oklch(0.7 0.14 250)" });
  });

  test("PD-141 — carries the source's attached book REFERENCES onto the clone (same books, new junction rows)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    const primary = await seedAttachedBook(db, { bookId: "world_book_primary", ownerId: owner, characterId: source.id, role: "primary" });
    const aux = await seedAttachedBook(db, { bookId: "world_book_aux", ownerId: owner, characterId: source.id, role: "auxiliary" });

    const copy = await svc.duplicate({ principal: principal(owner), characterId: source.id });

    // The clone's junctions point at the SAME books, roles preserved.
    const cloneJunctions = await db
      .select({ worldBookId: characterBooks.worldBookId, role: characterBooks.role })
      .from(characterBooks)
      .where(eq(characterBooks.characterId, copy.id));
    expect(new Set(cloneJunctions)).toEqual(
      new Set([
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ]),
    );

    // The books themselves are NOT cloned — still exactly the two originals.
    const books = await db.select({ id: worldBooks.id }).from(worldBooks);
    expect(books.map((b) => b.id).sort()).toEqual([aux, primary].sort());

    // The source's own junctions are untouched.
    const sourceJunctions = await db
      .select({ worldBookId: characterBooks.worldBookId, role: characterBooks.role })
      .from(characterBooks)
      .where(eq(characterBooks.characterId, source.id));
    expect(new Set(sourceJunctions)).toEqual(
      new Set([
        { worldBookId: primary, role: "primary" },
        { worldBookId: aux, role: "auxiliary" },
      ]),
    );
  });

  test("PD-141 — a source with zero attached books duplicates clean (no junction rows carried)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });

    const copy = await svc.duplicate({ principal: principal(owner), characterId: source.id });

    const cloneJunctions = await db.select().from(characterBooks).where(eq(characterBooks.characterId, copy.id));
    expect(cloneJunctions).toEqual([]);
    const books = await db.select().from(worldBooks);
    expect(books).toEqual([]);
  });
});
