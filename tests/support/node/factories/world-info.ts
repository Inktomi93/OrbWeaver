// Real world-info operations own admission, role transitions and stamps; these seeds capture their canonical rows.
import { backfillResultSchema } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, globalBooks, personaBooks, worldBooks, worldEntries } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type WorldInfoService = ServicesResult["services"]["worldInfo"];

export type WorldBookRow = typeof worldBooks.$inferSelect;
export type WorldEntryRow = typeof worldEntries.$inferSelect;
export type CharacterBookRow = typeof characterBooks.$inferSelect;
export type ChatBookRow = typeof chatBooks.$inferSelect;
export type GlobalBookRow = typeof globalBooks.$inferSelect;
export type PersonaBookRow = typeof personaBooks.$inferSelect;

export interface SeededWorldTitleBackfill {
  readonly result: Awaited<ReturnType<WorldInfoService["backfillTitles"]>>;
  readonly entries: readonly WorldEntryRow[];
}

/** Keep repair results tied to their actual book children, including unchanged entries. */
export async function seedBackfilledWorldTitles(
  root: ServerProducerRoot,
  params: Parameters<WorldInfoService["backfillTitles"]>[0],
): Promise<SeededWorldTitleBackfill> {
  const db = root.db;
  const backfill = root.services.worldInfo.backfillTitles;
  const result = backfillResultSchema.parse(await backfill(params));
  const entries = await db.select().from(worldEntries).where(eq(worldEntries.worldBookId, params.bookId)).orderBy(worldEntries.id);
  return { result, entries };
}

/** Produces the book through its owner operation; persisted stamps are not replaced by fixture time. */
export async function seedWorldBook(root: ServerProducerRoot, params: Parameters<WorldInfoService["createBook"]>[0]): Promise<WorldBookRow> {
  const db = root.db;
  const createBook = root.services.worldInfo.createBook;
  const view = await createBook(params);
  const row = await db.select().from(worldBooks).where(eq(worldBooks.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production book creation left no canonical world-book row");
  }
  return row;
}

/** Captures the real entry after book ownership and metadata validation have run. */
export async function seedWorldEntry(root: ServerProducerRoot, params: Parameters<WorldInfoService["createEntry"]>[0]): Promise<WorldEntryRow> {
  const db = root.db;
  const createEntry = root.services.worldInfo.createEntry;
  const view = await createEntry(params);
  const row = await db.select().from(worldEntries).where(eq(worldEntries.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production entry creation left no canonical world-entry row");
  }
  return row;
}

/** The real attachment performs primary demotion atomically; the seed only reads its resulting row. */
export async function seedCharacterBook(root: ServerProducerRoot, params: Parameters<WorldInfoService["attachToCharacter"]>[0]): Promise<CharacterBookRow> {
  const db = root.db;
  const attachToCharacter = root.services.worldInfo.attachToCharacter;
  await attachToCharacter(params);
  const row = await db
    .select()
    .from(characterBooks)
    .where(and(eq(characterBooks.characterId, params.characterId), eq(characterBooks.worldBookId, params.bookId)))
    .get();
  if (row === undefined) {
    throw new Error("production book attachment left no canonical character-book row");
  }
  return row;
}

/** The real room-host gate precedes capture; idempotent reattachment returns the persisted row unchanged. */
export async function seedChatBook(root: ServerProducerRoot, params: Parameters<WorldInfoService["attachToChat"]>[0]): Promise<ChatBookRow> {
  const db = root.db;
  const attachToChat = root.services.worldInfo.attachToChat;
  await attachToChat(params);
  const row = await db
    .select()
    .from(chatBooks)
    .where(and(eq(chatBooks.chatId, params.chatId), eq(chatBooks.worldBookId, params.bookId)))
    .get();
  if (row === undefined) {
    throw new Error("production book attachment left no canonical chat-book row");
  }
  return row;
}

/** Captures the book-keyed global attachment after the real book-ownership gate. */
export async function seedGlobalBook(root: ServerProducerRoot, params: Parameters<WorldInfoService["attachGlobal"]>[0]): Promise<GlobalBookRow> {
  const db = root.db;
  const attachGlobal = root.services.worldInfo.attachGlobal;
  await attachGlobal(params);
  const row = await db.select().from(globalBooks).where(eq(globalBooks.worldBookId, params.bookId)).get();
  if (row === undefined) {
    throw new Error("production book attachment left no canonical global-book row");
  }
  return row;
}

/** Captures the persona junction after the real operation gates both FK endpoints. */
export async function seedPersonaBook(root: ServerProducerRoot, params: Parameters<WorldInfoService["attachToPersona"]>[0]): Promise<PersonaBookRow> {
  const db = root.db;
  const attachToPersona = root.services.worldInfo.attachToPersona;
  await attachToPersona(params);
  const row = await db
    .select()
    .from(personaBooks)
    .where(and(eq(personaBooks.personaId, params.personaId), eq(personaBooks.worldBookId, params.bookId)))
    .get();
  if (row === undefined) {
    throw new Error("production book attachment left no canonical persona-book row");
  }
  return row;
}

/** All children follow the actual created book FK; absent attachment planes stay absent. */
export async function captureWorldBookRows(db: Db, bookId: WorldBookRow["id"]): Promise<CapturedWorldBookRows> {
  const book = await db.select().from(worldBooks).where(eq(worldBooks.id, bookId)).get();
  if (book === undefined) {
    throw new Error("produced world book ID has no canonical row");
  }
  const [entries, character, chat, global, persona] = await Promise.all([
    db.select().from(worldEntries).where(eq(worldEntries.worldBookId, bookId)).orderBy(worldEntries.id),
    db.select().from(characterBooks).where(eq(characterBooks.worldBookId, bookId)).orderBy(characterBooks.characterId),
    db.select().from(chatBooks).where(eq(chatBooks.worldBookId, bookId)).orderBy(chatBooks.chatId),
    db.select().from(globalBooks).where(eq(globalBooks.worldBookId, bookId)),
    db.select().from(personaBooks).where(eq(personaBooks.worldBookId, bookId)).orderBy(personaBooks.personaId),
  ]);
  return { book, entries, character, chat, global, persona };
}

interface CapturedWorldBookRows {
  readonly book: WorldBookRow;
  readonly entries: readonly WorldEntryRow[];
  readonly character: readonly CharacterBookRow[];
  readonly chat: readonly ChatBookRow[];
  readonly global: readonly GlobalBookRow[];
  readonly persona: readonly PersonaBookRow[];
}
