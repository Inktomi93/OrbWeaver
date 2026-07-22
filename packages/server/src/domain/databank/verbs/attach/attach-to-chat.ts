// verb: attachToChat — attach a caller-OWNED document to a chat room. Chats are MEMBERSHIP-scoped (D18), so
// the room gate is the INJECTED `ensureChatHost` (host authority — attaching injects content into every
// participant's prompts on the host's dime; member-initiated attach would be prompt injection by junction).
// The document gate stays ownership (`loadOwnedMeta` — the host shares THEIR document). Idempotent re-attach.

import { chatDocuments } from "@orb/db";
import { DocumentNotFoundError } from "../../contract/errors";
import type { ChatAttachParams } from "../../contract/params";
import type { DatabankContext, DatabankService } from "../../contract/service";
import { loadOwnedMeta } from "../../persistence/queries";

export function createAttachToChat(ctx: DatabankContext): DatabankService["attachToChat"] {
  return async ({ principal, documentId, chatId }: ChatAttachParams): Promise<void> => {
    const ownerId = principal.userId;
    const [, owned] = await Promise.all([ctx.ensureChatHost(principal, chatId), loadOwnedMeta(ctx.db, ownerId, documentId)]);
    if (owned === undefined) {
      throw new DocumentNotFoundError(documentId);
    }
    const inserted = await ctx.db
      .insert(chatDocuments)
      .values({ chatId, documentId })
      .onConflictDoNothing()
      .returning({ documentId: chatDocuments.documentId });
    if (inserted.length === 0) {
      return; // already attached — idempotent
    }
    await ctx.audit({ actorUserId: ownerId, action: "databank.attachToChat", entityType: "document", entityId: documentId, metadata: { chatId } }, ctx.now());
  };
}
