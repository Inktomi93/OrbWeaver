// Real databank producers retain canon/dedup/queue outcomes; capturing a row does not claim ingestion succeeded.
import type { Db } from "@orb/db";
import { characterDocuments, chatDocuments, documents, globalDocuments } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";

type DatabankService = ServicesResult["services"]["databank"];

export type DocumentRow = typeof documents.$inferSelect;
export type GlobalDocumentRow = typeof globalDocuments.$inferSelect;
export type CharacterDocumentRow = typeof characterDocuments.$inferSelect;
export type ChatDocumentRow = typeof chatDocuments.$inferSelect;

/** Captures text-origin canon through the actual hash/dedup/destination producer, including an existing winner. */
export async function seedDocument(
  db: Db,
  createFromText: DatabankService["createFromText"],
  params: Parameters<DatabankService["createFromText"]>[0],
): Promise<DocumentRow> {
  const result = await createFromText(params);
  const row = await db.select().from(documents).where(eq(documents.id, result.document.id)).get();
  if (row === undefined) {
    throw new Error("production document creation left no canonical document row");
  }
  return row;
}

/** Reads the caller's exact personal-global PK after the real document-ownership gate. */
export async function seedGlobalDocument(
  db: Db,
  attachGlobal: DatabankService["attachGlobal"],
  params: Parameters<DatabankService["attachGlobal"]>[0],
): Promise<GlobalDocumentRow> {
  await attachGlobal(params);
  const row = await db
    .select()
    .from(globalDocuments)
    .where(and(eq(globalDocuments.ownerId, params.principal.userId), eq(globalDocuments.documentId, params.documentId)))
    .get();
  if (row === undefined) {
    throw new Error("production document attachment left no canonical global-document row");
  }
  return row;
}

/** Captures the actual character junction only after the producer admits both FK endpoints. */
export async function seedCharacterDocument(
  db: Db,
  attachToCharacter: DatabankService["attachToCharacter"],
  params: Parameters<DatabankService["attachToCharacter"]>[0],
): Promise<CharacterDocumentRow> {
  await attachToCharacter(params);
  const row = await db
    .select()
    .from(characterDocuments)
    .where(and(eq(characterDocuments.characterId, params.characterId), eq(characterDocuments.documentId, params.documentId)))
    .get();
  if (row === undefined) {
    throw new Error("production document attachment left no canonical character-document row");
  }
  return row;
}

/** The real room-host and document-ownership gates precede this exact junction capture. */
export async function seedChatDocument(
  db: Db,
  attachToChat: DatabankService["attachToChat"],
  params: Parameters<DatabankService["attachToChat"]>[0],
): Promise<ChatDocumentRow> {
  await attachToChat(params);
  const row = await db
    .select()
    .from(chatDocuments)
    .where(and(eq(chatDocuments.chatId, params.chatId), eq(chatDocuments.documentId, params.documentId)))
    .get();
  if (row === undefined) {
    throw new Error("production document attachment left no canonical chat-document row");
  }
  return row;
}
