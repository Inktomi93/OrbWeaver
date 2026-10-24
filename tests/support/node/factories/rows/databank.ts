// Databank rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import type { UploadResult } from "@orb/contracts/databank";
import type { Db } from "@orb/db";
import { characterDocuments, chatDocuments, documents, globalDocuments } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type {
  CharacterDocumentRow,
  ChatDocumentRow,
  DatabankService,
  DocumentOrigin,
  DocumentRow,
  GlobalDocumentRow,
  SeededCreatedDocument,
} from "../databank.ts";

/** Retain the complete native envelope and private canon for a composed document-creation origin. */
export async function seedCreatedDocumentRows(root: ServerProducerRoot, origin: DocumentOrigin): Promise<SeededCreatedDocument> {
  const result = await (async (): Promise<UploadResult> => {
    switch (origin.kind) {
      case "upload":
        return await root.services.databank.upload(origin.params);
      case "createFromText":
        return await (await root.internalCallerFor(origin.userId)).databank.createFromText(origin.params);
      case "scrapeWeb":
        return await (await root.internalCallerFor(origin.userId)).databank.scrapeWeb(origin.params);
      case "scrapeYoutube":
        return await (await root.internalCallerFor(origin.userId)).databank.scrapeYoutube(origin.params);
      case "scrapeWiki":
        return await (await root.internalCallerFor(origin.userId)).databank.scrapeWiki(origin.params);
    }
  })();
  return await captureCreatedDocument(root.db, result);
}

async function captureCreatedDocument(db: Db, result: UploadResult): Promise<SeededCreatedDocument> {
  const row = await db.select().from(documents).where(eq(documents.id, result.document.id)).get();
  if (row === undefined) {
    throw new Error("production document creation left no canonical document row");
  }
  return { result, row };
}

/** Captures text-origin canon through the actual hash/dedup/destination producer, including an existing winner. */
export async function seedDocumentRows(root: ServerProducerRoot, params: Parameters<DatabankService["createFromText"]>[0]): Promise<DocumentRow> {
  return (await captureCreatedDocument(root.db, await root.services.databank.createFromText(params))).row;
}

/** Reads the caller's exact personal-global PK after the real document-ownership gate. */
export async function seedGlobalDocumentRows(root: ServerProducerRoot, params: Parameters<DatabankService["attachGlobal"]>[0]): Promise<GlobalDocumentRow> {
  const db = root.db;
  const attachGlobal = root.services.databank.attachGlobal;
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
export async function seedCharacterDocumentRows(
  root: ServerProducerRoot,
  params: Parameters<DatabankService["attachToCharacter"]>[0],
): Promise<CharacterDocumentRow> {
  const db = root.db;
  const attachToCharacter = root.services.databank.attachToCharacter;
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
export async function seedChatDocumentRows(root: ServerProducerRoot, params: Parameters<DatabankService["attachToChat"]>[0]): Promise<ChatDocumentRow> {
  const db = root.db;
  const attachToChat = root.services.databank.attachToChat;
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
