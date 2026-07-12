// domain/world-info/persistence/import-write — the world-info-OWNED lorebook bulk-import WRITE (Option B;
// PD-77). A named exception to "persistence is queries only": it commits an imported card's embedded
// `character_book` as `world_books` + `world_entries` + the PRIMARY `character_books` attach. `import`
// injects it as a contract-typed op (`@orb/contracts/world-info` `BulkImportLorebookInput` in,
// `BulkImportLorebookResult` out) and does the ST extraction itself (`#kit/serde/card`). Touches ONLY
// world-info's own tables + a precondition READ of `characters` for the ownership gate (the same table
// world-info reads for the character-scope attach — a sanctioned schema read, Tier-1-DB item 1).
//
// D-LEDGER:
//   • D28 — `character_books` keys on `characters.id` (no cv). The card-bound book is the `role:'primary'`
//     slot (at-most-one per character); it is the REPLACE key for a re-import (there is NO provenance column
//     on `world_books` — verified against the schema).
//   • D23 — `world_books.ownerId` is stamped (the importing owner); `world_entries` derive owner via the book.
// RE-IMPORT (the D28/PD-108 mirror): an existing primary book is edited IN PLACE — its book row is updated +
// ALL its entries are deleted and reinserted (the embedded book is a single authored unit, not incrementally
// merged), keeping the same `worldBookId` + the existing primary attach. No primary → create book + entries +
// primary attach. ATOMICITY: ONE `db.batch` per book; `db.transaction()` is BANNED (the `:memory:` trap).

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

/** The character must exist AND be the caller's — the card verb passes the owner it created/matched the
 *  character under; this is the leak-free ownership precondition (the FK would fail-closed anyway, but the
 *  explicit check gives a typed `DomainNotFoundError`). */
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

/** The character's existing PRIMARY (card-bound) book id, or null — the D28 re-import replace key. */
async function findPrimaryBookId(db: Db, characterId: CharacterId): Promise<WorldBookId | null> {
  const rows = await db
    .select({ worldBookId: characterBooks.worldBookId })
    .from(characterBooks)
    .where(and(eq(characterBooks.characterId, characterId), eq(characterBooks.role, "primary")))
    .limit(1);
  return rows[0]?.worldBookId ?? null;
}

/** Build the `world_entries` insert statements for a book (metadata validated at the write seam — the
 *  create-entry pattern; keys null-collapsed empty→NULL). */
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

/** Build the chat-owned bulk-import lorebook op. D28 replace-on-reimport over the primary attach; ONE
 *  `db.batch` per book. Throws {@link DomainNotFoundError} when the target character isn't the caller's. */
export function createBulkImportLorebook(ctx: WorldInfoImportContext): BulkImportLorebook {
  return async ({ ownerId, characterId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    await assertOwnedCharacter(db, ownerId, characterId);
    const at = ctx.now();
    const existingBookId = await findPrimaryBookId(db, characterId);

    if (existingBookId !== null) {
      // Re-import: update the book header, swap ALL entries (delete + reinsert), keep the primary attach.
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

    // Fresh: create the book, its entries, and the PRIMARY character attach.
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

// ── the STANDALONE (unattached) path — the `worlds/*.json` portability lane (W-worldinfo; §1) ──────────
// A sibling of `createBulkImportLorebook` that lands a LONE book with NO character attach. The embedded op
// can't cover this (it REQUIRES a characterId + always writes the primary attach), so this is the added
// owned write for the unattached case. Dedup key is `(ownerId, name)` (export-import-portability.md R6) —
// there is no primary-attach to key on. Reuses `entryStmts` (the shared insert projection); ONE `db.batch`;
// owner-stamped (D23).

/** The caller's existing book with this exact `name`, or null — the R6 standalone-import dedup key. Newest
 *  wins when names collide (a degenerate case; the dedup only needs ONE stable replace target). */
async function findBookByName(db: Db, ownerId: UserId, name: string): Promise<WorldBookId | null> {
  const rows = await db
    .select({ id: worldBooks.id })
    .from(worldBooks)
    .where(and(eq(worldBooks.ownerId, ownerId), eq(worldBooks.name, name)))
    .orderBy(desc(worldBooks.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Build the world-info-owned STANDALONE (unattached) bulk-import op — the `worlds/*.json` import target.
 *  Dedupes on `(ownerId, name)`: an existing same-named owned book is edited in place (header + full entry
 *  swap, same `worldBookId`, `replaced:true`); otherwise a fresh unattached book is created (`replaced:false`).
 *  NO `character_books` attach either way. ONE `db.batch`; `db.transaction()` is BANNED (the `:memory:` trap). */
export function createImportStandaloneLorebook(
  ctx: WorldInfoImportContext,
): ImportStandaloneLorebook {
  return async ({ ownerId, book }): Promise<BulkImportLorebookResult> => {
    const { db } = ctx;
    const at = ctx.now();
    const existingBookId = await findBookByName(db, ownerId, book.name);

    if (existingBookId !== null) {
      // Re-import: update the header, swap ALL entries (delete + reinsert), keep the same book id. Unattached.
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

    // Fresh: create the book + its entries. NO attach (a standalone book is unattached until the user links it).
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
