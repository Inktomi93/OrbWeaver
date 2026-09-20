// verb: attachToChat — attach a caller-OWNED document to a chat room. Chats are MEMBERSHIP-scoped (D18), so
// the room gate is the INJECTED `ensureChatHost` (host authority — attaching injects content into every
// participant's prompts on the host's dime; member-initiated attach would be prompt injection by junction).
// The document gate stays ownership (`loadOwnedMeta` — the host shares THEIR document). Idempotent re-attach.
// Announces on BOTH planes: the host's own bank (user bus) and the ROOM's rack (chat bus, #2471).

import { chatDocuments } from "@orb/db";
import { DocumentNotFoundError } from "../../contract/errors.ts";
import type { ChatAttachParams } from "../../contract/params.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";
import { loadOwnedMeta } from "../../persistence/queries.ts";

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
    // TWO PLANES, one write, and they are not interchangeable (#2471). The HOST's own bank view (the
    // attachment chips) is per-person and announces on the user bus; the ROOM's view of what feeds its
    // prompts (`listActiveForChat`) is MEMBER-VISIBLE and announces on the chat bus through the injected
    // room fan — widening the per-person member to the room is the exact leak `membership-fan-guard` bans,
    // and it was never the fix. This verb holds the `chatId`, so its reach is that one room; no lookup.
    ctx.emitRoomDatabankChanged(chatId);
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });
  };
}
