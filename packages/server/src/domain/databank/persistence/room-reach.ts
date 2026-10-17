// Reverse the consent-junction union; hidden documents still refresh the host's rack.
import type { Db } from "@orb/db";
import { characterDocuments, chatDocuments, chatParticipants, globalDocuments } from "@orb/db";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ChatId, DocumentId } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";

async function resolveDatabankRooms(db: Db, documentId: DocumentId): Promise<ChatId[]> {
  const [chatScoped, characterScoped, globalScoped] = await Promise.all([
    db.select({ chatId: chatDocuments.chatId }).from(chatDocuments).where(eq(chatDocuments.documentId, documentId)),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(characterDocuments)
      .innerJoin(chatParticipants, eq(chatParticipants.characterId, characterDocuments.characterId))
      .where(and(eq(characterDocuments.documentId, documentId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq))),
    db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(
        and(
          inArray(
            chatParticipants.userId,
            db.select({ ownerId: globalDocuments.ownerId }).from(globalDocuments).where(eq(globalDocuments.documentId, documentId)),
          ),
          eq(chatParticipants.kind, "human"),
          isNull(chatParticipants.leftSeq),
        ),
      ),
  ]);
  return [...chatScoped, ...characterScoped, ...globalScoped].map((row) => row.chatId);
}

/** Bind the document owner's junction-to-room read, retaining every present human's global credit. */
export function createDatabankRoomReach(handle: DatabaseHandle): (documentId: DocumentId) => Promise<ChatId[]> {
  const db = databaseForOwner(handle);
  return (documentId) => resolveDatabankRooms(db, documentId);
}
