// domain/databank/persistence/handoff-detach — the handoff's D64 document detach, built here because
// `chat_documents` is databank's table. Chat places the statement in its swap batch beside the book and script
// detaches (D337).

import { chatDocuments, documents } from "@orb/db";
import type { DatabaseHandle, StatementToken } from "@orb/db/wiring";
import { databaseForOwner, statementToken } from "@orb/db/wiring-owner";
import { and, eq, notInArray } from "drizzle-orm";
import type { DetachHandoffDocuments } from "../contract/handoff-detach.ts";

export function createDetachHandoffDocuments(handle: DatabaseHandle): DetachHandoffDocuments {
  const db = databaseForOwner(handle);
  return ({ chatId, hostUserId }): StatementToken =>
    statementToken(
      db
        .delete(chatDocuments)
        .where(
          and(
            eq(chatDocuments.chatId, chatId),
            notInArray(chatDocuments.documentId, db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, hostUserId))),
          ),
        ),
    );
}
