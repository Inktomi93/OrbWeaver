// domain/world-info/persistence/import-write — the world-info-owned lorebook bulk-import write. A named
// exception to "persistence is queries only": commits an imported card's embedded character_book as
// world_books + world_entries + the primary character_books attach.
//
// AN EXISTING PRIMARY IS REPLACED IN PLACE (header update + full entry delete+reinsert), keeping the same
// worldBookId + attach. The header takes the card's book name under the D290 free-name rule: another owned
// book holding that name numbers it, and the replaced row's own name never counts as taken. THAT IS THE RESTORE DOOR'S SEMANTIC, NOT THE RE-UPLOAD'S (owner ruling 2026-09-05,
// #1598): re-uploading a card file the owner already imported must NOT revert their edits to the book it
// carried, so the card-import verb asks `createHasPrimaryBook` first and skips this op when the seat is
// taken. The one caller that WANTS the replace is the explicit restore verb
// (`domain/import/verbs/restore-character-book.ts`), where "the card file is the source of truth" is the
// thing the owner asked for. `replaced: true` reports it either way.
//
// CENTRAL DEDUP (owner ruling — "one source of books"): when the character has no primary yet, the embedded
// book is CONTENT-matched against the owner's existing library BEFORE minting (`#kit/serde/world-info`'s
// `findDuplicateBook`, the regex `planCardLift` shape). A match LINKS this character to the existing
// world_books row (a fresh primary character_books attach); no book is duplicated. Only a genuinely new
// book mints a fresh row + entries, under the next free name when the owner already holds a different book
// under its name (the standalone path's rule, D290). This is the FALLBACK channel — the reference channel (`linkCarriedBooks`)
// resolves first and, when it links, the caller skips the embedded book entirely. One db.batch per
// book; db.transaction() is banned (the :memory: trap).
//
// THE STANDALONE PATH IS ADDITIVE (owner ruling): an import never edits or deletes an owned book. Equal
// content reuses the owned row under whatever name it carries; different content under a taken name lands
// beside it under the next free name. Only the restore door above replaces.
//
// ENTRY TITLES ARE FREE. Entries are keyed by their minted id; a title is SillyTavern's optional `comment`
// (empty by default, never unique), so a book whose entries share a title, or carry none, lands whole. The
// uniqueness check this write once ran protected the title-keyed `upsertEntries` stream (its callers key by
// title); that verb documents last-write-wins for a repeated title and needs no refusal here.

import type { BulkImportLorebookInput, BulkImportLorebookResult } from "@orb/contracts/world-info";
import { entryMetadataSchema } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, characters, worldBooks, worldEntries } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, UserId, WorldBookId } from "@orb/kit/ids";
import { nextFreeLabel } from "@orb/kit/strings";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { DedupBook, DedupCandidateBook, DedupLoreEntry } from "#kit/serde/world-info";
import { findDuplicateBook } from "#kit/serde/world-info";
import type { AttachOwnedBooksByName, BulkImportLorebook, HasPrimaryBook, ImportStandaloneLorebook, WorldInfoImportContext } from "../contract/import.ts";

/** The FK would fail-closed anyway, but the explicit check gives a typed DomainNotFoundError. */
async function assertOwnedCharacter(db: Db, ownerId: UserId, characterId: CharacterId): Promise<void> {
  const owned = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.ownerId, ownerId)))
    .limit(1);
  if (owned[0] === undefined) {
    throw new DomainNotFoundError("character", characterId);
  }
}

async function findPrimaryBookId(db: Db, characterId: CharacterId): Promise<WorldBookId | null> {
  const rows = await db
    .select({ worldBookId: characterBooks.worldBookId })
    .from(characterBooks)
    .where(and(eq(characterBooks.characterId, characterId), eq(characterBooks.role, "primary")))
    .limit(1);
  return rows[0]?.worldBookId ?? null;
}

/**
 * The #1598 non-destructiveness oracle: does this character already hold a PRIMARY book? Owner-scoped by
 * JOINING the character (a character that is not the caller's answers `false` rather than leaking that some
 * OTHER account's character holds a book). A READ in the import-write file on purpose: it reads exactly the
 * row {@link createBulkImportLorebook} would replace, off the same `findPrimaryBookId` seam, so the oracle
 * and the write it guards cannot drift apart.
 */
export function createHasPrimaryBook(ctx: Pick<WorldInfoImportContext, "db">): HasPrimaryBook {
  return async ({ ownerId, characterId }): Promise<boolean> => {
    const rows = await ctx.db
      .select({ worldBookId: characterBooks.worldBookId })
      .from(characterBooks)
      .innerJoin(characters, eq(characters.id, characterBooks.characterId))
      .where(and(eq(characterBooks.characterId, characterId), eq(characterBooks.role, "primary"), eq(characters.ownerId, ownerId)))
      .limit(1);
    return rows[0] !== undefined;
  };
}

function entryStmts(ctx: WorldInfoImportContext, worldBookId: WorldBookId, book: Parameters<BulkImportLorebook>[0]["book"], at: number): BatchStmt[] {
  return book.entries.map((e) =>
    batchStmt(
      ctx.db.insert(worldEntries).values({
        id: ctx.newEntryId(),
        worldBookId,
        title: e.title,
        description: e.description,
        content: e.content,
        keys: e.keys.length > 0 ? [...e.keys] : null,
        enabled: e.enabled,
        priority: e.priority,
        ignoreBudget: e.ignoreBudget,
        metadata: e.metadata === null ? null : entryMetadataSchema.parse(e.metadata),
        createdAt: at,
        updatedAt: at,
      }),
    ),
  );
}

/** The incoming embedded book projected onto the dedup shape. `metadata` is SCHEMA-PARSED here so its
 *  canonical key matches the stored form (`entryStmts` stores `entryMetadataSchema.parse(raw)`); miss that
 *  and a re-encoded identical book fails to match. `keys` collapse is deferred to the pure normalizer. */
function toDedupBook(book: BulkImportLorebookInput): DedupBook {
  return {
    name: book.name,
    entries: book.entries.map(
      (e): DedupLoreEntry => ({
        title: e.title,
        description: e.description,
        content: e.content,
        keys: e.keys,
        enabled: e.enabled,
        priority: e.priority,
        ignoreBudget: e.ignoreBudget,
        metadata: e.metadata === null ? null : entryMetadataSchema.parse(e.metadata),
      }),
    ),
  };
}

/** EVERY book the owner holds, each with its entries, as dedup candidates: the identity is the entry set,
 *  not the name, so a book that landed under a collision suffix still matches. Owner-scoped in the WHERE (a
 *  foreign book is never a candidate — cross-tenant gate). Two reads (books, then their entries) grouped in
 *  memory; `world_entries` metadata is the stored schema-parsed blob, so it is comparable to `toDedupBook`'s
 *  parsed side without re-parsing. */
async function loadOwnedBooksForDedup(db: Db, ownerId: UserId): Promise<DedupCandidateBook[]> {
  const books = await db.select({ id: worldBooks.id, name: worldBooks.name }).from(worldBooks).where(eq(worldBooks.ownerId, ownerId));
  if (books.length === 0) {
    return [];
  }
  const bookIds = books.map((b) => b.id);
  const entries = await db
    .select({
      worldBookId: worldEntries.worldBookId,
      title: worldEntries.title,
      description: worldEntries.description,
      content: worldEntries.content,
      keys: worldEntries.keys,
      enabled: worldEntries.enabled,
      priority: worldEntries.priority,
      ignoreBudget: worldEntries.ignoreBudget,
      metadata: worldEntries.metadata,
    })
    .from(worldEntries)
    .where(inArray(worldEntries.worldBookId, bookIds));
  // @orb-waive persistence-no-in-memory-state(Map): query-local grouping of candidate entries by book for the content-dedup planner (the DECISION lives in substrate/book-dedup). Ends if it outlives the call.
  const byBook = new Map<WorldBookId, DedupLoreEntry[]>();
  for (const e of entries) {
    const list = byBook.get(e.worldBookId) ?? [];
    list.push({
      title: e.title,
      description: e.description,
      content: e.content,
      keys: e.keys,
      enabled: e.enabled,
      priority: e.priority,
      ignoreBudget: e.ignoreBudget,
      metadata: e.metadata,
    });
    byBook.set(e.worldBookId, list);
  }
  return books.map((b) => ({ id: b.id, name: b.name, entries: byBook.get(b.id) ?? [] }));
}

/** Every name the caller's own books carry — the collision scan for the free-name mint. `except` leaves out
 *  the row a restore renames, so its own name is free to keep. */
async function listOwnedBookNames(db: Db, ownerId: UserId, except?: WorldBookId): Promise<string[]> {
  const rows = await db
    .select({ name: worldBooks.name })
    .from(worldBooks)
    .where(and(eq(worldBooks.ownerId, ownerId), except === undefined ? undefined : ne(worldBooks.id, except)));
  return rows.map((row) => row.name);
}

/** @throws {@link DomainNotFoundError} when the target character isn't the caller's. */
// @orb-waive owner-scoped-writes(worldBooks): `existingBookId` is not caller input — it is the PRIMARY book attached to a character this function just proved the caller owns (`assertOwnedCharacter`), and every path that can create that attachment gates both ends (`attachToCharacter` loads the owned book, `linkCarriedBooks` and `copyCharacterBooks` both carry the owned-source `ownerId` gate). Ends the day an attach can land a book the character's owner does not own — then this re-import would edit a stranger's book in place.
export function createBulkImportLorebook(ctx: WorldInfoImportContext): BulkImportLorebook {
  return async ({ ownerId, characterId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    await assertOwnedCharacter(db, ownerId, characterId);
    const at = ctx.now();
    const existingBookId = await findPrimaryBookId(db, characterId);

    if (existingBookId !== null) {
      const name = nextFreeLabel(book.name, await listOwnedBookNames(db, ownerId, existingBookId));
      const stmts: BatchStmt[] = [
        batchStmt(db.update(worldBooks).set({ name, description: book.description, updatedAt: at }).where(eq(worldBooks.id, existingBookId))),
        batchStmt(db.delete(worldEntries).where(eq(worldEntries.worldBookId, existingBookId))),
        ...entryStmts(ctx, existingBookId, book, at),
      ];
      await db.batch(batchMany(stmts));
      return {
        worldBookId: existingBookId,
        entryCount: book.entries.length,
        replaced: true,
        created: false,
        name,
        renamedFrom: name === book.name ? null : book.name,
      };
    }

    // CENTRAL DEDUP: before minting, link to an existing content-equivalent book the owner already holds
    // ("one source of books"). The primary seat is free here (no existing primary above), so the match
    // attaches as `primary`; onConflictDoNothing keeps a re-link idempotent.
    const duplicate = findDuplicateBook(toDedupBook(book), await loadOwnedBooksForDedup(db, ownerId));
    if (duplicate !== null) {
      await db.insert(characterBooks).values({ characterId, worldBookId: duplicate.id, role: "primary", createdAt: at }).onConflictDoNothing();
      return { worldBookId: duplicate.id, entryCount: book.entries.length, replaced: false, created: false, name: duplicate.name, renamedFrom: null };
    }

    const name = nextFreeLabel(book.name, await listOwnedBookNames(db, ownerId));
    const bookId = ctx.newBookId();
    const stmts: BatchStmt[] = [
      batchStmt(
        db.insert(worldBooks).values({
          id: bookId,
          ownerId,
          name,
          description: book.description,
          createdAt: at,
          updatedAt: at,
        }),
      ),
      ...entryStmts(ctx, bookId, book, at),
      batchStmt(
        db.insert(characterBooks).values({
          characterId,
          worldBookId: bookId,
          role: "primary",
          createdAt: at,
        }),
      ),
    ];
    await db.batch(batchMany(stmts));
    return { worldBookId: bookId, entryCount: book.entries.length, replaced: false, created: true, name, renamedFrom: name === book.name ? null : book.name };
  };
}

/** Each link name's owned book: a name this import's worlds wave landed binds that row (re-proven owned, so
 *  the op attaches only the caller's books whoever built the map); any other name takes the newest owned book
 *  carrying it exactly. A name absent from the result is dangling. */
async function resolveLinkNames(
  db: Db,
  ownerId: UserId,
  names: readonly string[],
  landed: ReadonlyMap<string, WorldBookId>,
): Promise<ReadonlyMap<string, WorldBookId>> {
  // @orb-waive persistence-no-in-memory-state(Map): query-local name resolution for one attach call. Ends if it outlives the call.
  const resolved = new Map<string, WorldBookId>();
  const landedIds = names.flatMap((name) => landed.get(name) ?? []);
  if (landedIds.length > 0) {
    const owned = await db
      .select({ id: worldBooks.id })
      .from(worldBooks)
      .where(and(eq(worldBooks.ownerId, ownerId), inArray(worldBooks.id, landedIds)));
    for (const name of names) {
      const id = landed.get(name);
      if (id !== undefined && owned.some((row) => row.id === id)) {
        resolved.set(name, id);
      }
    }
  }
  // Newest-wins per name (the `findBookByName` rule, batched). Ordered ASC so the LAST write per name in the
  // fold is the newest row — and the `id` tiebreak makes that TOTAL: `created_at` is not unique, so books
  // minted together (a bundle restore) would otherwise let the storage scan decide which one a name resolves to.
  const unlanded = names.filter((name) => !landed.has(name));
  if (unlanded.length > 0) {
    const candidates = await db
      .select({ id: worldBooks.id, name: worldBooks.name })
      .from(worldBooks)
      .where(and(eq(worldBooks.ownerId, ownerId), inArray(worldBooks.name, unlanded)))
      .orderBy(asc(worldBooks.createdAt), asc(worldBooks.id));
    for (const row of candidates) {
      resolved.set(row.name, row.id);
    }
  }
  return resolved;
}

/**
 * The ST NAME-LINK attach (`AttachOwnedBooksByName` — see the contract's doc for the semantics). A name the
 * same import landed binds the landed row; any other name resolves by the owner-scoped (ownerId, name)
 * newest-wins key. A `primary` request demotes to `auxiliary` when the character already holds a primary
 * (at-most-one-primary is a verb-layer invariant — the embedded `character_book` import above claims the
 * seat first in the profile-import ordering). onConflictDoNothing keeps a re-import idempotent (PK
 * `(characterId, worldBookId)`).
 */
export function createAttachOwnedBooksByName(ctx: WorldInfoImportContext): AttachOwnedBooksByName {
  return async ({ ownerId, characterId, names, role, landed }) => {
    const { db } = ctx;
    if (names.length === 0) {
      return { linked: 0, missing: [] };
    }
    await assertOwnedCharacter(db, ownerId, characterId);
    const primaryFree = role === "primary" && (await findPrimaryBookId(db, characterId)) === null;
    const resolved = await resolveLinkNames(db, ownerId, names, landed);

    const at = ctx.now();
    const missing: string[] = [];
    const attachRows: (typeof characterBooks.$inferInsert)[] = [];
    let primarySeatOpen = primaryFree;
    for (const name of names) {
      const bookId = resolved.get(name);
      if (bookId === undefined) {
        missing.push(name);
        continue;
      }
      // Only the FIRST RESOLVED name can take the primary seat — one attach call carries one desired role.
      attachRows.push({ characterId, worldBookId: bookId, role: primarySeatOpen ? "primary" : "auxiliary", createdAt: at });
      primarySeatOpen = false;
    }
    if (attachRows.length > 0) {
      await db.insert(characterBooks).values(attachRows).onConflictDoNothing();
    }
    return { linked: attachRows.length, missing };
  };
}

// The standalone (unattached) path — a sibling of createBulkImportLorebook that lands a lone book with no
// character attach, additively: equal content reuses the owned row (under the name it carries), different
// content lands under the next free name, and no owned row is ever edited.

export function createImportStandaloneLorebook(ctx: WorldInfoImportContext): ImportStandaloneLorebook {
  return async ({ ownerId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    const at = ctx.now();

    const duplicate = findDuplicateBook(toDedupBook(book), await loadOwnedBooksForDedup(db, ownerId));
    if (duplicate !== null) {
      return { worldBookId: duplicate.id, entryCount: book.entries.length, replaced: false, created: false, name: duplicate.name, renamedFrom: null };
    }

    const name = nextFreeLabel(book.name, await listOwnedBookNames(db, ownerId));
    const bookId = ctx.newBookId();
    const stmts: BatchStmt[] = [
      batchStmt(
        db.insert(worldBooks).values({
          id: bookId,
          ownerId,
          name,
          description: book.description,
          createdAt: at,
          updatedAt: at,
        }),
      ),
      ...entryStmts(ctx, bookId, book, at),
    ];
    await db.batch(batchMany(stmts));
    return { worldBookId: bookId, entryCount: book.entries.length, replaced: false, created: true, name, renamedFrom: name === book.name ? null : book.name };
  };
}
