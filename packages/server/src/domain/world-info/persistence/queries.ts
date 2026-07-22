// domain/world-info/persistence/queries — all db access for the books/entries store. Every read is
// owner-scoped in the WHERE. Ownership derives through the book: world_entries has no ownerId, so an
// entry is owned iff its worldBookId is one of the caller's books (never a bare eq(id) — cross-tenant hole).
// toEntryView parses the stored metadata blob at the read seam; a corrupt row degrades to null.

import type { LoreConstantCanonRow } from "@orb/contracts/world-info";
import { entryMetadataSchema } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, globalBooks, personaBooks, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, ChatId, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { resolveEntryScope } from "@orb/kit/world-info";
import { and, desc, eq } from "drizzle-orm";
import type { BookAttachmentView, BookView, EntryView, WorldBookRole } from "../contract/views";

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
  const rows = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, ownerId)).orderBy(desc(worldBooks.createdAt));
  return rows;
}

// The caller guards book ownership first (so this can't probe a foreign book's entry set).
export async function listBookEntries(db: Db, bookId: WorldBookId): Promise<EntryRow[]> {
  const rows = await db.select().from(worldEntries).where(eq(worldEntries.worldBookId, bookId)).orderBy(desc(worldEntries.priority));
  return rows;
}

export async function listCharacterBooks(db: Db, ownerId: UserId, characterId: CharacterId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks, role: characterBooks.role })
    .from(characterBooks)
    .innerJoin(worldBooks, eq(characterBooks.worldBookId, worldBooks.id))
    .where(and(eq(characterBooks.characterId, characterId), eq(worldBooks.ownerId, ownerId)))
    .orderBy(desc(characterBooks.role), desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, r.role));
}

export async function listGlobalBooks(db: Db, ownerId: UserId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(globalBooks)
    .innerJoin(worldBooks, eq(globalBooks.worldBookId, worldBooks.id))
    .where(eq(worldBooks.ownerId, ownerId))
    .orderBy(desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, null));
}

// Not owner-filtered — a chat's attached books are room-public prompt content (membership is the caller gate).
export async function listChatBooks(db: Db, chatId: ChatId): Promise<BookAttachmentView[]> {
  const rows = await db
    .select({ book: worldBooks })
    .from(chatBooks)
    .innerJoin(worldBooks, eq(chatBooks.worldBookId, worldBooks.id))
    .where(eq(chatBooks.chatId, chatId))
    .orderBy(desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, null));
}

/** A chat's CONSTANT ("always"-scope) lorebook canon — the entries a pre-play producer treats as world truth
 *  (rpg-design/06 §4). Joins the chat's attached books → their enabled entries, resolves each entry's scope
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
    .orderBy(desc(worldEntries.priority));
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
    .orderBy(desc(worldBooks.createdAt));
  return rows.map((r) => toAttachmentView(r.book, null));
}
