// verb: detachFromChat — clear a document's chat scope. Host-gated (the same D18 authority as attach — a
// member must not remove content the host injected). Idempotent: a detach of a non-attached pair is a no-op.

import { chatDocuments } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { ChatAttachParams } from "../../contract/params.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";

export function createDetachFromChat(ctx: DatabankContext): DatabankService["detachFromChat"] {
  return async ({ principal, documentId, chatId }: ChatAttachParams): Promise<void> => {
    const ownerId = principal.userId;
    await ctx.ensureChatHost(principal, chatId);
    const deleted = await ctx.db
      .delete(chatDocuments)
      .where(and(eq(chatDocuments.chatId, chatId), eq(chatDocuments.documentId, documentId)))
      .returning({ documentId: chatDocuments.documentId });
    if (deleted.length === 0) {
      return; // not attached — idempotent
    }
    await ctx.audit({ actorUserId: ownerId, action: "databank.detachFromChat", entityType: "document", entityId: documentId, metadata: { chatId } }, ctx.now());
    // The host's own bank view; the room's half is the SAME owner-deferred gap `attach-to-chat` states in
    // full, held by `membership-write-fan:databank-detach-from-chat`.
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });
  };
}
