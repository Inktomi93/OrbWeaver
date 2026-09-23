// domain/world-info/persistence/queries — all db access for the books/entries store. Every read is
// owner-scoped in the WHERE. Ownership derives through the book: world_entries has no ownerId, so an
// entry is owned iff its worldBookId is one of the caller's books (never a bare eq(id) — cross-tenant hole).
// toEntryView parses the stored metadata blob at the read seam; a corrupt row degrades to null.
//
// EVERY LIST READ CARRIES A TOTAL ORDER. `createdAt` and `priority` are both non-unique — a bundle restore
// mints a whole library in one millisecond and an un-reordered entry sits at the default priority 0 — so a
// sort on them alone leaves the tie to the storage engine and the same data renders differently run to run.
// The `id` is the tiebreak (TypeIDs are uuidv7-backed, so it is also a recency order): it continues the
// primary key's own intent — `DESC` under a newest-first `createdAt`, and `ASC` inside a `priority` band so
// a newly created entry appends to the END of its band instead of jumping the queue.

import type { LoreConstantCanonRow } from "@orb/contracts/world-info";
import { entryMetadataSchema } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, characters, chatBooks, globalBooks, personaBooks, personas, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, ChatId, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { resolveEntryScope } from "@orb/kit/world-info";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { BookAttachmentTargets, BookAttachmentView, BookUsage, BookView, BookWithUsage, EntryView, WorldBookRole } from "../contract/views.ts";

const LIMIT_ONE = 1;

type BookRow = typeof worldBooks.$inferSelect;
type EntryRow = typeof worldEntries.$inferSelect;

export function toBookView(row: BookRow): BookView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  };
}

export function toEntryView(row: EntryRow): EntryView {
  return {
    id: row.id,
    worldBookId: row.worldBookId,
    title: row.title,
    description: row.description,
    content: row.content,
    keys: row.keys ?? null,
    enabled: row.enabled,
    priority: row.priority,
    ignoreBudget: row.ignoreBudget,
    metadata: entryMetadataSchema.nullable().catch(null).parse(row.metadata),
  };
}

function toAttachmentView(row: BookRow, role: WorldBookRole | null): BookAttachmentView {
  return { ...toBookView(row), role };
}

export async function loadOwnedBook(db: Db, ownerId: UserId, bookId: WorldBookId): Promise<BookRow | undefined> {
  const rows = await db
    .select()
    .from(worldBooks)
    .where(and(eq(worldBooks.id, bookId), eq(worldBooks.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

export async function loadOwnedEntry(db: Db, ownerId: UserId, entryId: WorldEntryId): Promise<EntryRow | undefined> {
  const rows = await db
    .select({ entry: worldEntries })
    .from(worldEntries)
    .innerJoin(worldBooks, eq(worldEntries.worldBookId, worldBooks.id))
    .where(and(eq(worldEntries.id, entryId), eq(worldBooks.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0]?.entry;
}

export async function listOwnedBooks(db: Db, ownerId: UserId): Promise<BookRow[]> {
  const rows = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, ownerId)).orderBy(desc(worldBooks.createdAt), desc(worldBooks.id));
  return rows;
}

// ── The with-usage rollup (the config-workspace roster read) ────────────────────────────────────────────
// Independent GROUP BY queries merged in-process, never an N-way LEFT JOIN (that multiplies rows across the
// junctions and lies about every count but the first) — the `listOwnedTagsWithUsage` shape, one domain over.
// THIS IS THE SECOND INSTANCE of the with-usage reverse-rollup pattern (tags, now books); the queued
// REGROSTER small (regex "attached by" rosters) would be the third. At three, a shared substrate may be
// worth minting — FLAG it there, do not build it here off two.

/** Count junction rows per BOOK for the given book ids, on one junction's `worldBookId` column. */
async function countByBook(db: Db, table: SQLiteTable, bookCol: SQLiteColumn, ids: readonly WorldBookId[]): Promise<Record<string, number>> {
  const rows = await db
    .select({ bookId: bookCol, n: sql<number>`count(*)` })
    .from(table)
    .where(inArray(bookCol, [...ids]))
    .groupBy(bookCol);
  return Object.fromEntries(rows.map((r) => [r.bookId, r.n]));
}

/** Every owned book plus its entry count and its four-scope attachment rollup (the Configuration
 *  workspace's roster read). Owner-scoped through `listOwnedBooks`; the junction counts are then keyed to
 *  those ids only, so a foreign book can never contribute a count. */
export async function listOwnedBooksWithUsage(db: Db, ownerId: UserId): Promise<BookWithUsage[]> {
  const owned = await listOwnedBooks(db, ownerId);
  if (owned.length === 0) {
    return [];
  }
  const ids = owned.map((b) => b.id);
  // Named `*Counts` because the table symbols `characters`/`personas` are imported into this module (the
  // attachment-target join below) — a bare `characters` here would shadow one of them.
  const [entries, characterCounts, personaCounts, chats, globals] = await Promise.all([
    countByBook(db, worldEntries, worldEntries.worldBookId, ids),
    countByBook(db, characterBooks, characterBooks.worldBookId, ids),
    countByBook(db, personaBooks, personaBooks.worldBookId, ids),
    countByBook(db, chatBooks, chatBooks.worldBookId, ids),
    countByBook(db, globalBooks, globalBooks.worldBookId, ids),
  ]);
  return owned.map((row) => {
    const global = (globals[row.id] ?? 0) > 0;
    const usage: BookUsage = {
      characters: characterCounts[row.id] ?? 0,
      personas: personaCounts[row.id] ?? 0,
      chats: chats[row.id] ?? 0,
      global,
      total: 0,
    };
    return {
      ...toBookView(row),
      entryCount: entries[row.id] ?? 0,
      usage: { ...usage, total: usage.characters + usage.personas + usage.chats + (global ? 1 : 0) },
    };
  });
}

// The caller guards book ownership first (so this can't probe a foreign book's entry set).
export async function listBookEntries(db: Db, bookId: WorldBookId): Promise<EntryRow[]> {
  const rows = await db.select().from(worldEntries).where(eq(worldEntries.worldBookId, bookId)).orderBy(desc(worldEntries.priority), asc(worldEntries.id));
  return rows;
}

export async function listCharacterBooks(db: Db, ownerId: UserId, characterId: CharacterId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks, role: characterBooks.role })
    .from(characterBooks)
    .innerJoin(worldBooks, eq(characterBooks.worldBookId, worldBooks.id))
    .where(and(eq(characterBooks.characterId, characterId), eq(worldBooks.ownerId, ownerId)))
    .orderBy(desc(characterBooks.role), desc(worldBooks.createdAt), desc(worldBooks.id));
  return rows.map((r) => toAttachmentView(r.book, r.role));
}

/** The two owner-scoped target junctions for one already-owner-gated book. Chat attachments are excluded:
 *  their membership-scoped names and controls live in the room, never the owner's library.
 *
 *  BOTH ENDS are scoped, not just the book. The caller proves the BOOK is theirs (`loadOwnedBook`), but a
 *  junction row may name a character or persona owned by SOMEONE ELSE — `handoff-copy-write`'s header states
 *  such cross-owner junctions exist in practice, and the `duplicate-carry` #1516 fix is the same gate on the
 *  mirror-image pair. Ownership is INHERITED through the FK chain (D18), so the target join carries the
 *  caller's `ownerId` too: an INNER JOIN, never a post-filter (a second source of truth for one predicate).
 *  A foreign target is dropped silently — this read is a roster, and its answer is the caller's own set. */
export async function listAttachmentTargetsForBook(db: Db, ownerId: UserId, bookId: WorldBookId): Promise<BookAttachmentTargets> {
  const [characterRows, personaRows] = await Promise.all([
    db
      .select({ characterId: characterBooks.characterId, role: characterBooks.role })
      .from(characterBooks)
      .innerJoin(characters, eq(characters.id, characterBooks.characterId))
      .where(and(eq(characterBooks.worldBookId, bookId), eq(characters.ownerId, ownerId)))
      .orderBy(asc(characters.id)),
    db
      .select({ personaId: personaBooks.personaId })
      .from(personaBooks)
      .innerJoin(personas, eq(personas.id, personaBooks.personaId))
      .where(and(eq(personaBooks.worldBookId, bookId), eq(personas.ownerId, ownerId)))
      .orderBy(asc(personas.id)),
  ]);
  return { characters: characterRows, personaIds: personaRows.map((row) => row.personaId) };
}

export async function listGlobalBooks(db: Db, ownerId: UserId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(globalBooks)
    .innerJoin(worldBooks, eq(globalBooks.worldBookId, worldBooks.id))
    .where(eq(worldBooks.ownerId, ownerId))
    .orderBy(desc(worldBooks.createdAt), desc(worldBooks.id));
  return rows.map((r) => toAttachmentView(r.book, null));
}

// Not owner-filtered — a chat's attached books are room-public prompt content (membership is the caller gate).
export async function listChatBooks(db: Db, chatId: ChatId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(chatBooks)
    .innerJoin(worldBooks, eq(chatBooks.worldBookId, worldBooks.id))
    .where(eq(chatBooks.chatId, chatId))
    .orderBy(desc(worldBooks.createdAt), desc(worldBooks.id));
  return rows.map((r) => toAttachmentView(r.book, null));
}

/** A chat's CONSTANT ("always"-scope) lorebook canon — the entries a pre-play producer treats as world truth
 *  (docs/plans/rpg/design.md). Joins the chat's attached books → their enabled entries, resolves each entry's scope
 *  (explicit `metadata.scopeMode`, else the keys-presence heuristic), and keeps the always-on ones. Not
 *  owner-filtered — a chat's attached books are room-public prompt content (membership is the caller gate,
 *  mirroring listChatBooks). */
export async function listChatConstantCanon(db: Db, chatId: ChatId): Promise<LoreConstantCanonRow[]> {
  const rows = await db
    .select({
      title: worldEntries.title,
      content: worldEntries.content,
      keys: worldEntries.keys,
      metadata: worldEntries.metadata,
      enabled: worldEntries.enabled,
    })
    .from(chatBooks)
    .innerJoin(worldEntries, eq(worldEntries.worldBookId, chatBooks.worldBookId))
    .where(eq(chatBooks.chatId, chatId))
    .orderBy(desc(worldEntries.priority), asc(worldEntries.id));
  return rows
    .filter((r) => r.enabled && resolveEntryScope(r.metadata, (r.keys ?? []).length > 0) === "always")
    .map((r) => ({ title: r.title, content: r.content }));
}

/** Reverse of listChatBooks. A book attached to zero chats returns []. */
export async function listChatIdsForBook(db: Db, bookId: WorldBookId): Promise<ChatId[]> {
  const rows = await db.select({ chatId: chatBooks.chatId }).from(chatBooks).where(eq(chatBooks.worldBookId, bookId));
  return rows.map((r) => r.chatId);
}

export async function listPersonaBooks(db: Db, ownerId: UserId, personaId: PersonaId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(personaBooks)
    .innerJoin(worldBooks, eq(personaBooks.worldBookId, worldBooks.id))
    .where(and(eq(personaBooks.personaId, personaId), eq(worldBooks.ownerId, ownerId)))
    .orderBy(desc(worldBooks.createdAt), desc(worldBooks.id));
  return rows.map((r) => toAttachmentView(r.book, null));
}
