// Databank seeds run the production verbs and return their outcomes; rows-tier twins in `rows/databank.ts` read the rows.

import type { UploadResult } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";
import type { characterDocuments, chatDocuments, documents, globalDocuments } from "@orb/db";
import type { ChatId, DocumentId, UserId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type DatabankService = ServicesResult["services"]["databank"];
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
export type DocumentOrigin =
  | { readonly kind: "upload"; readonly params: Parameters<DatabankService["upload"]>[0] }
  | {
      readonly [K in RoutedDocumentOrigin]: { readonly kind: K; readonly userId: UserId; readonly params: Parameters<DatabankCaller[K]>[0] };
    }[RoutedDocumentOrigin];

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
