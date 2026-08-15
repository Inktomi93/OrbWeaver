// domain/world-info/persistence/import-write — the world-info-owned lorebook bulk-import write. A named
// exception to "persistence is queries only": commits an imported card's embedded character_book as
// world_books + world_entries + the primary character_books attach.
//
// Re-import: an existing primary book is edited in place (header update + full entry delete+reinsert),
// keeping the same worldBookId + attach. No primary -> create book + entries + primary attach. One
// db.batch per book; db.transaction() is banned (the :memory: trap).

import type { BulkImportLorebookResult } from "@orb/contracts/world-info";
import { entryMetadataSchema } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, characters, worldBooks, worldEntries } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, UserId, WorldBookId } from "@orb/kit/ids";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AttachOwnedBooksByName, BulkImportLorebook, ImportStandaloneLorebook, WorldInfoImportContext } from "../contract/import.ts";

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

/** @throws {@link DomainNotFoundError} when the target character isn't the caller's. */
// @owner-scope-write-ok: `existingBookId` is not caller input — it is the PRIMARY book attached to a character
// this function just proved the caller owns (`assertOwnedCharacter`), and every path that can create that
// attachment gates both ends (`attachToCharacter` loads the owned book, `linkCarriedBooks` and
// `copyCharacterBooks` both carry the owned-source `ownerId` gate). Ends the day an attach can land a book the
// character's owner does not own — then this re-import would edit a stranger's book in place.
export function createBulkImportLorebook(ctx: WorldInfoImportContext): BulkImportLorebook {
  return async ({ ownerId, characterId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    await assertOwnedCharacter(db, ownerId, characterId);
    const at = ctx.now();
    const existingBookId = await findPrimaryBookId(db, characterId);

    if (existingBookId !== null) {
      const stmts: BatchStmt[] = [
        batchStmt(db.update(worldBooks).set({ name: book.name, description: book.description, updatedAt: at }).where(eq(worldBooks.id, existingBookId))),
        batchStmt(db.delete(worldEntries).where(eq(worldEntries.worldBookId, existingBookId))),
        ...entryStmts(ctx, existingBookId, book, at),
      ];
      await db.batch(batchMany(stmts));
      return { worldBookId: existingBookId, entryCount: book.entries.length, replaced: true };
    }

    const bookId = ctx.newBookId();
    const stmts: BatchStmt[] = [
      batchStmt(
        db.insert(worldBooks).values({
          id: bookId,
          ownerId,
          name: book.name,
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
    return { worldBookId: bookId, entryCount: book.entries.length, replaced: false };
  };
}

/**
 * The ST NAME-LINK attach (`AttachOwnedBooksByName` — see the contract's doc for the semantics). Resolution
 * is `findBookByName` — the SAME owner-scoped (ownerId, name)/newest-wins key the standalone import dedups
 * on, so a name links exactly the book that import would have merged onto. A `primary` request demotes to
 * `auxiliary` when the character already holds a primary (at-most-one-primary is a verb-layer invariant —
 * the embedded `character_book` import above claims the seat first in the profile-import ordering).
 * onConflictDoNothing keeps a re-import idempotent (PK `(characterId, worldBookId)`).
 */
export function createAttachOwnedBooksByName(ctx: WorldInfoImportContext): AttachOwnedBooksByName {
  return async ({ ownerId, characterId, names, role }) => {
    const { db } = ctx;
    if (names.length === 0) {
      return { linked: 0, missing: [] };
    }
    await assertOwnedCharacter(db, ownerId, characterId);
    const primaryFree = role === "primary" && (await findPrimaryBookId(db, characterId)) === null;

    // ONE owner-scoped resolve for the whole name list; newest-wins per name (the `findBookByName` rule,
    // batched). Ordered ASC so the LAST write per name in the fold is the newest row.
    const candidates = await db
      .select({ id: worldBooks.id, name: worldBooks.name })
      .from(worldBooks)
      .where(and(eq(worldBooks.ownerId, ownerId), inArray(worldBooks.name, [...names])))
      .orderBy(asc(worldBooks.createdAt));
    // @orb-gate-ignore persistence-no-in-memory-state: query-local newest-wins fold for the batch resolve
    const newestByName = new Map<string, WorldBookId>();
    for (const row of candidates) {
      newestByName.set(row.name, row.id);
    }

    const at = ctx.now();
    const missing: string[] = [];
    const attachRows: (typeof characterBooks.$inferInsert)[] = [];
    let primarySeatOpen = primaryFree;
    for (const name of names) {
      const bookId = newestByName.get(name);
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
// character attach. Dedup key is (ownerId, name); newest wins when names collide.

async function findBookByName(db: Db, ownerId: UserId, name: string): Promise<WorldBookId | null> {
  const rows = await db
    .select({ id: worldBooks.id })
    .from(worldBooks)
    .where(and(eq(worldBooks.ownerId, ownerId), eq(worldBooks.name, name)))
    .orderBy(desc(worldBooks.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

// @owner-scope-write-ok: `existingBookId` is resolved one line down by `findBookByName(db, ownerId, name)`, an
// OWNER-SCOPED read — the dedup key is `(ownerId, name)`, so a book that is not the caller's is never a
// candidate. Ends if the dedup lookup stops carrying `eq(worldBooks.ownerId, …)`.
export function createImportStandaloneLorebook(ctx: WorldInfoImportContext): ImportStandaloneLorebook {
  return async ({ ownerId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    const at = ctx.now();
    const existingBookId = await findBookByName(db, ownerId, book.name);

    if (existingBookId !== null) {
      const stmts: BatchStmt[] = [
        batchStmt(db.update(worldBooks).set({ name: book.name, description: book.description, updatedAt: at }).where(eq(worldBooks.id, existingBookId))),
        batchStmt(db.delete(worldEntries).where(eq(worldEntries.worldBookId, existingBookId))),
        ...entryStmts(ctx, existingBookId, book, at),
      ];
      await db.batch(batchMany(stmts));
      return { worldBookId: existingBookId, entryCount: book.entries.length, replaced: true };
    }

    const bookId = ctx.newBookId();
    const stmts: BatchStmt[] = [
      batchStmt(
        db.insert(worldBooks).values({
          id: bookId,
          ownerId,
          name: book.name,
          description: book.description,
          createdAt: at,
          updatedAt: at,
        }),
      ),
      ...entryStmts(ctx, bookId, book, at),
    ];
    await db.batch(batchMany(stmts));
    return { worldBookId: bookId, entryCount: book.entries.length, replaced: false };
  };
}
