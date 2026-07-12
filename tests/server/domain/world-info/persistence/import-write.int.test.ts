// Mirror int-test for domain/world-info/persistence/createBulkImportLorebook (Option B; W1; PD-77) — the
// world-info-OWNED lorebook bulk-import WRITE over a real db: `world_books` + `world_entries` + the PRIMARY
// `character_books` attach, D28 replace-on-reimport (the primary slot is the replace key — no provenance
// column), and the ownership precondition. Input is the canonical `BulkImportLorebookInput`
// (`@orb/contracts/world-info`); the ST extraction is import's job (tested via the card substrate).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, worldBooks, worldEntries } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { WorldInfoImportContext } from "../../../../../packages/server/src/domain/world-info/contract/import.ts";
import { createBulkImportLorebook } from "../../../../../packages/server/src/domain/world-info/persistence/import-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures";

const NOW = 1_700_000_000_000;

/** A deterministic counter-minted `WorldInfoImportContext`. */
function importCtx(db: Db): WorldInfoImportContext {
  let n = 0;
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    db,
    now: (): number => NOW,
    newBookId: (): WorldBookId => castId<WorldBookId>(`world_book_${counter()}`),
    newEntryId: (): WorldEntryId => castId<WorldEntryId>(`world_entry_${counter()}`),
  };
}

function book(over: Partial<BulkImportLorebookInput> = {}): BulkImportLorebookInput {
  return {
    name: "Aria's World",
    description: "the lore",
    entries: [
      {
        title: "The Kingdom",
        description: null,
        content: "A realm of eternal dusk.",
        keys: ["kingdom", "realm"],
        enabled: true,
        priority: 10,
        ignoreBudget: false,
        metadata: { scopeMode: "always" },
      },
    ],
    ...over,
  };
}

describe("createBulkImportLorebook", () => {
  test("writes world_books + world_entries + the PRIMARY character_books attach", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportLorebook(importCtx(db));

    const result = await op({ ownerId: owner.id, characterId: character.id, book: book() });

    expect(result.replaced).toBe(false);
    expect(result.entryCount).toBe(1);

    const books = await db.select().from(worldBooks);
    expect(books).toHaveLength(1);
    expect(books[0]?.name).toBe("Aria's World");
    expect(books[0]?.ownerId).toBe(owner.id);

    const entries = await db.select().from(worldEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe("The Kingdom");
    expect(entries[0]?.keys).toEqual(["kingdom", "realm"]);
    // metadata is validated through entryMetadataSchema at the write seam.
    expect(entries[0]?.metadata?.scopeMode).toBe("always");

    const attach = await db
      .select()
      .from(characterBooks)
      .where(eq(characterBooks.characterId, character.id));
    expect(attach).toHaveLength(1);
    expect(attach[0]?.role).toBe("primary");
    expect(attach[0]?.worldBookId).toBe(result.worldBookId);
  });

  test("empty keys null-collapse (the world_entries NULL-vs-[] asymmetry)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportLorebook(importCtx(db));

    await op({
      ownerId: owner.id,
      characterId: character.id,
      book: book({
        entries: [
          {
            title: "Always",
            description: null,
            content: "fires every turn",
            keys: [],
            enabled: true,
            priority: 0,
            ignoreBudget: false,
            metadata: null,
          },
        ],
      }),
    });

    const entries = await db.select().from(worldEntries);
    expect(entries[0]?.keys).toBeNull();
  });

  test("D28 replace-on-reimport — the existing PRIMARY book's entries are swapped in place", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportLorebook(importCtx(db));

    const first = await op({ ownerId: owner.id, characterId: character.id, book: book() });
    const second = await op({
      ownerId: owner.id,
      characterId: character.id,
      book: book({
        name: "Aria's World (edited)",
        entries: [
          {
            title: "New Lore",
            description: null,
            content: "rewritten",
            keys: ["new"],
            enabled: true,
            priority: 5,
            ignoreBudget: false,
            metadata: null,
          },
          {
            title: "Second",
            description: null,
            content: "another",
            keys: ["two"],
            enabled: true,
            priority: 1,
            ignoreBudget: false,
            metadata: null,
          },
        ],
      }),
    });

    expect(second.replaced).toBe(true);
    expect(second.worldBookId).toBe(first.worldBookId); // same book, edited in place
    // ONE book, its header updated, entries fully swapped (old dropped), ONE primary attach (not doubled).
    const books = await db.select().from(worldBooks);
    expect(books).toHaveLength(1);
    expect(books[0]?.name).toBe("Aria's World (edited)");
    const entries = await db.select().from(worldEntries);
    expect(entries.map((e) => e.title).sort()).toEqual(["New Lore", "Second"]);
    const attach = await db.select().from(characterBooks);
    expect(attach).toHaveLength(1);
  });

  test("a non-owned / missing character throws DomainNotFoundError (the ownership precondition)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportLorebook(importCtx(db));
    await expect(
      op({ ownerId: owner.id, characterId: castId("character_missing"), book: book() }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
