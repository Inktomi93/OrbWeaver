// Mirror int-test for domain/world-info/persistence/createBulkImportLorebook (Option B; W1) — the
// world-info-OWNED lorebook bulk-import WRITE over a real db: `world_books` + `world_entries` + the PRIMARY
// `character_books` attach, D28 replace-on-reimport (the primary slot is the replace key — no provenance
// column), and the ownership precondition. Input is the canonical `BulkImportLorebookInput`
// (`@orb/contracts/world-info`); the ST extraction is import's job (tested via the card substrate).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, worldBooks, worldEntries } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { WorldInfoImportContext } from "../../../../../packages/server/src/domain/world-info/contract/import.ts";
import {
  createAttachOwnedBooksByName,
  createBulkImportLorebook,
  createImportStandaloneLorebook,
} from "../../../../../packages/server/src/domain/world-info/persistence/import-write.ts";
import { listCharacterBooks } from "../../../../../packages/server/src/domain/world-info/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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

    const attach = await db.select().from(characterBooks).where(eq(characterBooks.characterId, character.id));
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
    await expect(op({ ownerId: owner.id, characterId: castId("character_missing"), book: book() })).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

describe("createImportStandaloneLorebook", () => {
  test("rejects duplicate entry titles within one request before replacing an existing book", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createImportStandaloneLorebook(importCtx(db));
    await op({ ownerId: owner.id, book: book() });
    const originalEntry = book().entries.at(0);
    if (originalEntry === undefined) {
      throw new Error("book fixture must contain an entry");
    }
    const duplicate = book({ entries: [originalEntry, { ...originalEntry, content: "conflicting duplicate" }] });

    await expect(op({ ownerId: owner.id, book: duplicate })).rejects.toBeInstanceOf(DomainOperationError);

    expect((await db.select().from(worldEntries)).map((entry) => entry.content)).toEqual(["A realm of eternal dusk."]);
  });

  // The (ownerId, name) dedup key resolves NEWEST-WINS through a `createdAt DESC LIMIT 1` — and `createdAt`
  // is not unique, so two same-name books minted in one instant (a bundle restore) leave the storage engine
  // to pick which one this import REPLACES. That is a destructive read: the loser keeps stale entries and
  // the winner changes between runs. `id DESC` makes "newest" total.
  test("same-name books tied on createdAt resolve to ONE deterministic target (newest id wins)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const older = castId<WorldBookId>("world_book_aaa");
    const newer = castId<WorldBookId>("world_book_zzz");
    // Inserted lowest-id-FIRST so storage-scan order is the opposite of the expected winner.
    await db.insert(worldBooks).values({ id: older, ownerId: owner.id, name: "Aria's World", description: null, createdAt: NOW });
    await db.insert(worldBooks).values({ id: newer, ownerId: owner.id, name: "Aria's World", description: null, createdAt: NOW });

    const result = await createImportStandaloneLorebook(importCtx(db))({ ownerId: owner.id, book: book() });

    expect(result).toEqual({ worldBookId: newer, entryCount: 1, replaced: true });
    expect((await db.select().from(worldEntries)).map((entry) => entry.worldBookId)).toEqual([newer]);
  });
});

// ── CENTRAL DEDUP (#303, owner ruling 2026-08-19: "one source of books") ─────────────────────────────────
// A second character carrying the SAME embedded book LINKS to the one central world_books row instead of
// minting a duplicate; a same-name DIFFERENT book still mints (no lossy merge); the read path resolves the
// shared book through the character_books junction.
describe("createBulkImportLorebook — central dedup", () => {
  test("a second character with the SAME embedded book links to the existing central book (no duplicate)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const aria = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const ariaVariant = await seedCharacter(db, { ownerId: owner.id, handle: castId("aria-2"), name: "Aria (variant)" });
    const op = createBulkImportLorebook(importCtx(db));

    const first = await op({ ownerId: owner.id, characterId: aria.id, book: book() });
    const second = await op({ ownerId: owner.id, characterId: ariaVariant.id, book: book() });

    // ONE central book, ONE entry set — not duplicated.
    expect(second.worldBookId).toBe(first.worldBookId);
    expect(second.replaced).toBe(false);
    expect(await db.select().from(worldBooks)).toHaveLength(1);
    expect(await db.select().from(worldEntries)).toHaveLength(1);

    // BOTH characters are linked (primary) to the one shared book.
    const attach = await db.select().from(characterBooks);
    expect(attach).toHaveLength(2);
    expect(attach.map((r) => r.worldBookId)).toEqual([first.worldBookId, first.worldBookId]);
    expect(attach.map((r) => r.role).sort()).toEqual(["primary", "primary"]);
  });

  test("the read path resolves the shared book through the character_books link for BOTH characters", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const aria = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const ariaVariant = await seedCharacter(db, { ownerId: owner.id, handle: castId("aria-2"), name: "Aria (variant)" });
    const op = createBulkImportLorebook(importCtx(db));

    const first = await op({ ownerId: owner.id, characterId: aria.id, book: book() });
    await op({ ownerId: owner.id, characterId: ariaVariant.id, book: book() });

    const [ariaBooks, variantBooks] = await Promise.all([listCharacterBooks(db, owner.id, aria.id), listCharacterBooks(db, owner.id, ariaVariant.id)]);
    expect(ariaBooks).toHaveLength(1);
    expect(ariaBooks[0]?.id).toBe(first.worldBookId);
    expect(ariaBooks[0]?.role).toBe("primary");
    expect(variantBooks).toHaveLength(1);
    expect(variantBooks[0]?.id).toBe(first.worldBookId);
    expect(variantBooks[0]?.role).toBe("primary");
  });

  test("a same-NAME but different-CONTENT book still MINTS a fresh row (no lossy merge)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const aria = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const other = await seedCharacter(db, { ownerId: owner.id, handle: castId("other"), name: "Other" });
    const op = createBulkImportLorebook(importCtx(db));

    const first = await op({ ownerId: owner.id, characterId: aria.id, book: book() });
    const second = await op({
      ownerId: owner.id,
      characterId: other.id,
      book: book({
        entries: [
          {
            title: "The Kingdom",
            description: null,
            content: "A DIFFERENT realm — same name, different lore.",
            keys: ["kingdom", "realm"],
            enabled: true,
            priority: 10,
            ignoreBudget: false,
            metadata: { scopeMode: "always" },
          },
        ],
      }),
    });

    expect(second.worldBookId).not.toBe(first.worldBookId);
    expect(await db.select().from(worldBooks)).toHaveLength(2);
  });

  test("a FOREIGN owner's identical book is NEVER a dedup candidate (cross-tenant gate)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const stranger = await seedUser(db, { handle: castId("stranger"), email: "s@x.test" });
    const strangerChar = await seedCharacter(db, { ownerId: stranger.id, name: "Stranger's Aria" });
    const mine = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const op = createBulkImportLorebook(importCtx(db));

    const strangers = await op({ ownerId: stranger.id, characterId: strangerChar.id, book: book() });
    const ours = await op({ ownerId: owner.id, characterId: mine.id, book: book() });

    // Identical content, different owner — must NOT link to the stranger's book; a fresh owned book is minted.
    expect(ours.worldBookId).not.toBe(strangers.worldBookId);
    expect(await db.select().from(worldBooks)).toHaveLength(2);
  });
});

// ── the ST NAME-LINK attach (the silent-gap sweep, 2026-08-15) ───────────────────────────────────────────
// A card's `extensions.world` and `charLore.extraBooks` name books by NAME (ids never cross a box). The op
// resolves by the standalone import's own (ownerId, name) key and honours the at-most-one-primary invariant.
describe("createAttachOwnedBooksByName", () => {
  test("attaches an owned book by exact name; primary when the seat is free, and dangling names come back", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const ctx = importCtx(db);
    await createImportStandaloneLorebook(ctx)({ ownerId: owner.id, book: book({ name: "Eldoria" }) });
    const op = createAttachOwnedBooksByName(ctx);

    const result = await op({ ownerId: owner.id, characterId: character.id, names: ["Eldoria", "Never Downloaded"], role: "primary" });

    expect(result.linked).toBe(1);
    // Exact-name only — the corpus's 28 dangling world names must come back verbatim for the report.
    expect(result.missing).toEqual(["Never Downloaded"]);
    const attach = await db.select().from(characterBooks);
    expect(attach).toHaveLength(1);
    expect(attach[0]?.role).toBe("primary");
  });

  test("a `primary` request DEMOTES to auxiliary when an embedded book already claimed the seat", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const ctx = importCtx(db);
    // The embedded `character_book` import runs FIRST in the profile-import ordering and takes primary.
    await createBulkImportLorebook(ctx)({ ownerId: owner.id, characterId: character.id, book: book({ name: "Embedded" }) });
    await createImportStandaloneLorebook(ctx)({ ownerId: owner.id, book: book({ name: "Eldoria" }) });

    const result = await createAttachOwnedBooksByName(ctx)({ ownerId: owner.id, characterId: character.id, names: ["Eldoria"], role: "primary" });

    expect(result.linked).toBe(1);
    const roles = (await db.select().from(characterBooks)).map((r) => r.role).sort();
    // ONE primary (the embedded book), the name-link demoted — never two primaries.
    expect(roles).toEqual(["auxiliary", "primary"]);
  });

  test("charLore auxiliaries attach as auxiliary; a foreign owner's same-named book NEVER resolves; re-runs are idempotent", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const stranger = await seedUser(db, { handle: castId("stranger"), email: "s@x.test" });
    const character = await seedCharacter(db, { ownerId: owner.id, name: "Aria" });
    const ctx = importCtx(db);
    // The STRANGER owns a book with exactly the name the charLore binding asks for — it must not link.
    await createImportStandaloneLorebook(ctx)({ ownerId: stranger.id, book: book({ name: "Foreign Lore" }) });
    await createImportStandaloneLorebook(ctx)({ ownerId: owner.id, book: book({ name: "Extra Lore" }) });
    const op = createAttachOwnedBooksByName(ctx);

    const result = await op({ ownerId: owner.id, characterId: character.id, names: ["Extra Lore", "Foreign Lore"], role: "auxiliary" });
    expect(result.linked).toBe(1);
    expect(result.missing).toEqual(["Foreign Lore"]);
    expect((await db.select().from(characterBooks)).map((r) => r.role)).toEqual(["auxiliary"]);

    // Idempotent: the PK collision no-ops, the attach count stays 1.
    await op({ ownerId: owner.id, characterId: character.id, names: ["Extra Lore"], role: "auxiliary" });
    expect(await db.select().from(characterBooks)).toHaveLength(1);
  });
});
