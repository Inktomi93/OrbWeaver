// verb: attachToChat — attach a caller-OWNED document to a chat room. Chats are MEMBERSHIP-scoped (D18), so
// the room gate is the INJECTED `ensureChatHost` (host authority — attaching injects content into every
// participant's prompts on the host's dime; member-initiated attach would be prompt injection by junction).
// The document gate stays ownership (`loadOwnedMeta` — the host shares THEIR document). Idempotent re-attach.

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
    // The HOST's own bank view (the attachment chips) announces itself here, on a real attach only. The
    // ROOM's view of what feeds its prompts (`listActiveForChat`) is member-visible state and must NOT ride
    // this user-bus member — widening a per-person channel to the room is the exact leak `membership-fan-guard`
    // bans. WHAT IS AND IS NOT ENFORCED, stated plainly (the previous wording claimed "the rack already rides
    // `chatUpdated`", which is true only of the rack's MEMBERSHIP/VISIBILITY half — roster changes and the D85
    // visibility write emit that event; THIS write emits no room fan at all, so a co-member's rack stays
    // pre-attach until some other `chatUpdated` arrives): the gap is the OWNER-DEFERRED databank `bridge` row
    // (bridge design §8 + fork F-E, 2026-08-14), and it is now held by an exact reviewed grant with its end
    // condition — `membership-write-fan:databank-attach-to-chat` in
    // tooling/src/verify/lib/reviewed-grants-membership-write-fan.ts. The day this verb gains a room fan,
    // central liveness reports that row stale; nothing else enforces the claim.
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });
  };
}
