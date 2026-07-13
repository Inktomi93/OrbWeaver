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
import { and, desc, eq } from "drizzle-orm";
import type {
  BulkImportLorebook,
  ImportStandaloneLorebook,
  WorldInfoImportContext,
} from "../contract/import";

/** The FK would fail-closed anyway, but the explicit check gives a typed DomainNotFoundError. */
async function assertOwnedCharacter(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<void> {
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

function entryStmts(
  ctx: WorldInfoImportContext,
  worldBookId: WorldBookId,
  book: Parameters<BulkImportLorebook>[0]["book"],
  at: number,
): BatchStmt[] {
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
      }),
    ),
  );
}

/** @throws {@link DomainNotFoundError} when the target character isn't the caller's. */
export function createBulkImportLorebook(ctx: WorldInfoImportContext): BulkImportLorebook {
  return async ({ ownerId, characterId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    await assertOwnedCharacter(db, ownerId, characterId);
    const at = ctx.now();
    const existingBookId = await findPrimaryBookId(db, characterId);

    if (existingBookId !== null) {
      const stmts: BatchStmt[] = [
        batchStmt(
          db
            .update(worldBooks)
            .set({ name: book.name, description: book.description })
            .where(eq(worldBooks.id, existingBookId)),
        ),
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

export function createImportStandaloneLorebook(
  ctx: WorldInfoImportContext,
): ImportStandaloneLorebook {
  return async ({ ownerId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    const at = ctx.now();
    const existingBookId = await findBookByName(db, ownerId, book.name);

    if (existingBookId !== null) {
      const stmts: BatchStmt[] = [
        batchStmt(
          db
            .update(worldBooks)
            .set({ name: book.name, description: book.description })
            .where(eq(worldBooks.id, existingBookId)),
        ),
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
        }),
      ),
      ...entryStmts(ctx, bookId, book, at),
    ];
    await db.batch(batchMany(stmts));
    return { worldBookId: bookId, entryCount: book.entries.length, replaced: false };
  };
}
