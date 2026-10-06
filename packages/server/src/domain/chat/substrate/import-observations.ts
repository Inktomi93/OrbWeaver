import type { BulkImportChatInput, ImportedChatIdentity } from "@orb/contracts/chat";
import { pendingGenerationObservationsSchema } from "@orb/contracts/chat";
import type { chatGenerationObservations } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatTurnId, UserId } from "@orb/kit/ids";

/** Remint private operation groups once while preserving native positional source identity. */
export function importedObservationRows(
  newChatTurnId: () => ChatTurnId,
  ownerId: UserId,
  ci: BulkImportChatInput,
  identity: ImportedChatIdentity,
): (typeof chatGenerationObservations.$inferInsert)[] {
  const turns = new Map<number, ChatTurnId>();
  return pendingGenerationObservationsSchema.parse(ci.pendingGenerationObservations ?? []).map((row) => {
    const sourceMessageId = row.sourceMessageIndex === null ? null : identity.messageIds[row.sourceMessageIndex];
    const sourceVariantId =
      row.sourceMessageIndex === null || row.sourceVariantIdx === null ? null : identity.variantIds[row.sourceMessageIndex]?.[row.sourceVariantIdx];
    if (sourceMessageId === undefined || sourceVariantId === undefined) {
      throw new DomainNotFoundError("message", String(row.sourceMessageIndex));
    }
    const turnId = turns.get(row.turnIndex) ?? newChatTurnId();
    turns.set(row.turnIndex, turnId);
    return {
      ...row.leg,
      chatId: identity.chatId,
      turnId,
      ordinal: row.ordinal,
      sourceMessageId,
      sourceVariantId,
      // Restored retained-data attribution is the importer, never an invented original private payer.
      funderUserId: ownerId,
      connectionId: null,
      connectionAttributionProvenance: "unrecorded",
      responseCache: row.leg.responseCache ?? null,
    };
  });
}
