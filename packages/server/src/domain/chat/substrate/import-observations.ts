import type { BulkImportChatInput, ImportedChatIdentity } from "@orb/contracts/chat";
import { pendingGenerationObservationsSchema } from "@orb/contracts/chat";
import type { chatGenerationObservations } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatTurnId, UserId } from "@orb/kit/ids";

type ImportedObservation = ReturnType<typeof pendingGenerationObservationsSchema.parse>[number];

/** The minted ids a row's positional source names; both null for a row that names no source message. */
function sourceIdsOf(
  row: ImportedObservation,
  identity: ImportedChatIdentity,
): Pick<typeof chatGenerationObservations.$inferInsert, "sourceMessageId" | "sourceVariantId"> {
  const index = row.sourceMessageIndex;
  if (index === null) {
    return { sourceMessageId: null, sourceVariantId: null };
  }
  const sourceMessageId = identity.messageIds[index];
  const sourceVariantId = row.sourceVariantIdx === null ? null : identity.variantIds[index]?.[row.sourceVariantIdx];
  if (sourceMessageId === undefined || sourceVariantId === undefined) {
    throw new DomainNotFoundError({ kind: "imported message", index });
  }
  return { sourceMessageId, sourceVariantId };
}

/** Remint private operation groups once while preserving native positional source identity. */
export function importedObservationRows(
  newChatTurnId: () => ChatTurnId,
  ownerId: UserId,
  ci: BulkImportChatInput,
  identity: ImportedChatIdentity,
): (typeof chatGenerationObservations.$inferInsert)[] {
  const turns = new Map<number, ChatTurnId>();
  return pendingGenerationObservationsSchema.parse(ci.pendingGenerationObservations ?? []).map((row) => {
    const { sourceMessageId, sourceVariantId } = sourceIdsOf(row, identity);
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
