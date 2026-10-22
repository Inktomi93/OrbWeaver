// Real databank producers retain canon/dedup/queue outcomes; capturing a row does not claim ingestion succeeded.
import type { UploadResult } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { characterDocuments, chatDocuments, documents, globalDocuments } from "@orb/db";
import type { ChatId, DocumentId, UserId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type DatabankService = ServicesResult["services"]["databank"];
type DatabankCaller = Awaited<ReturnType<ServerProducerRoot["internalCallerFor"]>>["databank"];

export type DocumentRow = typeof documents.$inferSelect;
export type GlobalDocumentRow = typeof globalDocuments.$inferSelect;
export type CharacterDocumentRow = typeof characterDocuments.$inferSelect;
export type ChatDocumentRow = typeof chatDocuments.$inferSelect;

export interface SeededCreatedDocument {
  readonly result: UploadResult;
  readonly row: DocumentRow;
}

const DOCUMENT_ORIGINS = ["upload", "createFromText", "scrapeWeb", "scrapeYoutube", "scrapeWiki"] as const;
type DocumentOriginKind = (typeof DOCUMENT_ORIGINS)[number];
type RoutedDocumentOrigin = Exclude<DocumentOriginKind, "upload">;
type DocumentOrigin =
  | { readonly kind: "upload"; readonly params: Parameters<DatabankService["upload"]>[0] }
  | {
      readonly [K in RoutedDocumentOrigin]: { readonly kind: K; readonly userId: UserId; readonly params: Parameters<DatabankCaller[K]>[0] };
    }[RoutedDocumentOrigin];

/** Retain the complete native envelope and private canon for a composed document-creation origin. */
export async function seedCreatedDocument(root: ServerProducerRoot, origin: DocumentOrigin): Promise<SeededCreatedDocument> {
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
export async function seedDocument(root: ServerProducerRoot, params: Parameters<DatabankService["createFromText"]>[0]): Promise<DocumentRow> {
  return (await captureCreatedDocument(root.db, await root.services.databank.createFromText(params))).row;
}

export interface CapturedDatabankViews {
  readonly metadata: Awaited<ReturnType<DatabankService["get"]>>;
  readonly source: Awaited<ReturnType<DatabankService["get"]>>;
  readonly page: Awaited<ReturnType<DatabankService["list"]>>;
  readonly health: Awaited<ReturnType<DatabankService["bankHealth"]>>;
  readonly globalIds: Awaited<ReturnType<DatabankService["listGlobal"]>>;
  readonly attachments: Awaited<ReturnType<DatabankService["listAttachments"]>>;
  readonly active: Awaited<ReturnType<DatabankService["listActiveForChat"]>>;
}

/** Capture owned bank reads and the independently membership-gated room projection without copying either policy. */
export async function captureDatabankViews(
  root: ServerProducerRoot,
  principal: Principal,
  refs: { readonly documentId: DocumentId; readonly chatId: ChatId },
): Promise<CapturedDatabankViews> {
  const databank = root.services.databank;
  return {
    metadata: await databank.get({ principal, id: refs.documentId }),
    source: await databank.get({ principal, id: refs.documentId, includeText: true }),
    page: await databank.list({ principal, limit: 1 }),
    health: await databank.bankHealth({ principal }),
    globalIds: await databank.listGlobal({ principal }),
    attachments: await databank.listAttachments({ principal, id: refs.documentId }),
    active: await databank.listActiveForChat({ principal, chatId: refs.chatId }),
  };
}

/** Reads the caller's exact personal-global PK after the real document-ownership gate. */
export async function seedGlobalDocument(root: ServerProducerRoot, params: Parameters<DatabankService["attachGlobal"]>[0]): Promise<GlobalDocumentRow> {
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
export async function seedCharacterDocument(
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
export async function seedChatDocument(root: ServerProducerRoot, params: Parameters<DatabankService["attachToChat"]>[0]): Promise<ChatDocumentRow> {
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
