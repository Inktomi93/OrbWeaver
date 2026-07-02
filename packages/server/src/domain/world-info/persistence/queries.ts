// domain/world-info/persistence/queries — ALL db access for the books/entries store (queries only, no
// business logic). Every read is owner-scoped (the predicate is part of the WHERE, never a post-filter), so
// a non-owner can never receive another user's row. `ownerId` is `principal.userId` (§7.1) — this layer
// NEVER reads the `users` table (the `no-direct-users-read` chokepoint).
//
// OWNERSHIP DERIVES THROUGH THE BOOK (D23): `world_books.ownerId` is the only owner stamp; `world_entries`
// has no `ownerId`, so an entry is owned iff its `worldBookId` is one of the caller's books. `loadOwnedEntry`
// joins through `world_books` for reads; the update/remove verbs fold the same gate into their WHERE via
// `ownedBookIds` (the `inArray(worldEntries.worldBookId, <owned book ids subquery>)` pattern — NEVER a bare
// `eq(id)`, which would allow a cross-tenant write; world-info.md invariant #4).
//
// `toEntryView` parses the stored `metadata` blob through `entryMetadataSchema` at the read seam (§8.4
// parse-at-the-DB-seam): drizzle hands back whatever `JSON.parse` produced typed as `EntryMetadata` without
// validating it, so a corrupt row degrades to `null` here (`.catch(null)`) instead of poisoning the typed
// view (world-info.md invariant #5 — `EntryView.metadata: EntryMetadata | null`, not `unknown`).

import { entryMetadataSchema } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import {
  characterBooks,
  chatBooks,
  globalBooks,
  personaBooks,
  worldBooks,
  worldEntries,
} from "@orb/db";
import type {
  CharacterId,
  ChatId,
  PersonaId,
  UserId,
  WorldBookId,
  WorldEntryId,
} from "@orb/kit/ids";
import { and, desc, eq } from "drizzle-orm";
import type { BookAttachmentView, BookView, EntryView, WorldBookRole } from "../contract/views";

const LIMIT_ONE = 1;

type BookRow = typeof worldBooks.$inferSelect;
type EntryRow = typeof worldEntries.$inferSelect;

// ── Projections (pure — no DB) ───────────────────────────────────────────────

/** A stored book row → the client view (drops `ownerId`). */
export function toBookView(row: BookRow): BookView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
  };
}

/** A stored entry row → the client view. `metadata` is narrowed through `entryMetadataSchema` at this read
 *  seam — a corrupt blob degrades to `null` rather than poisoning the typed view (invariant #5). */
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

/** A book row + its per-character attachment `role` → the attachment view. `role` is null for the global /
 *  persona scopes (only the character scope carries a role). */
export function toAttachmentView(row: BookRow, role: WorldBookRole | null): BookAttachmentView {
  return { ...toBookView(row), role };
}

// ── Ownership-scoped loads ───────────────────────────────────────────────────

/** One owned book, or undefined when not found / not the caller's. */
export async function loadOwnedBook(
  db: Db,
  ownerId: UserId,
  bookId: WorldBookId,
): Promise<BookRow | undefined> {
  const rows = await db
    .select()
    .from(worldBooks)
    .where(and(eq(worldBooks.id, bookId), eq(worldBooks.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0];
}

/** One entry owned (via its book) by the caller, or undefined. The owner gate is the JOIN to
 *  `world_books` + the `ownerId` predicate — entries carry no owner of their own (D23). */
export async function loadOwnedEntry(
  db: Db,
  ownerId: UserId,
  entryId: WorldEntryId,
): Promise<EntryRow | undefined> {
  const rows = await db
    .select({ entry: worldEntries })
    .from(worldEntries)
    .innerJoin(worldBooks, eq(worldEntries.worldBookId, worldBooks.id))
    .where(and(eq(worldEntries.id, entryId), eq(worldBooks.ownerId, ownerId)))
    .limit(LIMIT_ONE);
  return rows[0]?.entry;
}

// ── Owner-scoped lists ───────────────────────────────────────────────────────
// The entry update/remove ownership gate (the `inArray(worldEntries.worldBookId, <owned book ids subquery>)`
// pattern — invariant #4) is built inline in those verbs, where the mutation lives: the subquery
// `db.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, ownerId))` folds straight
// into the UPDATE/DELETE WHERE so the gate + the write are one round-trip (no bare `eq(id)` cross-tenant hole).

/** The caller's books, newest first. */
export async function listOwnedBooks(db: Db, ownerId: UserId): Promise<BookRow[]> {
  const rows = await db
    .select()
    .from(worldBooks)
    .where(eq(worldBooks.ownerId, ownerId))
    .orderBy(desc(worldBooks.createdAt));
  return rows;
}

/** All entries of a book, by descending `priority` (the display + injection order). The CALLER guards book
 *  ownership first (so this can't probe a foreign book's entry set). */
export async function listBookEntries(db: Db, bookId: WorldBookId): Promise<EntryRow[]> {
  const rows = await db
    .select()
    .from(worldEntries)
    .where(eq(worldEntries.worldBookId, bookId))
    .orderBy(desc(worldEntries.priority));
  return rows;
}

// ── Attachment lists (each re-applies the owner predicate as a symmetric belt) ──

/** Books attached to a character, primary first then newest, owner-scoped via the book. Carries the role. */
export async function listCharacterBooks(
  db: Db,
  ownerId: UserId,
  characterId: CharacterId,
): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks, role: characterBooks.role })
    .from(characterBooks)
    .innerJoin(worldBooks, eq(characterBooks.worldBookId, worldBooks.id))
    .where(and(eq(characterBooks.characterId, characterId), eq(worldBooks.ownerId, ownerId)))
    .orderBy(desc(characterBooks.role), desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, r.role));
}

/** The caller's global books, newest first (owner-scoped via the book). Role is null. */
export async function listGlobalBooks(db: Db, ownerId: UserId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(globalBooks)
    .innerJoin(worldBooks, eq(globalBooks.worldBookId, worldBooks.id))
    .where(eq(worldBooks.ownerId, ownerId))
    .orderBy(desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, null));
}

/** Books attached to a chat room, newest first. Role is null. NOT owner-filtered — a chat's attached books
 *  are ROOM-PUBLIC prompt content (D18: membership is the caller gate, applied by the verb via the injected
 *  chat guard; the pool builder reads this junction the same un-owned way). */
export async function listChatBooks(db: Db, chatId: ChatId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(chatBooks)
    .innerJoin(worldBooks, eq(chatBooks.worldBookId, worldBooks.id))
    .where(eq(chatBooks.chatId, chatId))
    .orderBy(desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, null));
}

/** Books attached to a persona, newest first, owner-scoped via the book. Role is null. */
export async function listPersonaBooks(
  db: Db,
  ownerId: UserId,
  personaId: PersonaId,
): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(personaBooks)
    .innerJoin(worldBooks, eq(personaBooks.worldBookId, worldBooks.id))
    .where(and(eq(personaBooks.personaId, personaId), eq(worldBooks.ownerId, ownerId)))
    .orderBy(desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, null));
}
