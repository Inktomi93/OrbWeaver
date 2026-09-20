// verb: attachGlobal — mark an owned document global (auto-active in all the owner's chats). Gate is plain
// document ownership (`loadOwnedMeta` — a user can only make their OWN document global). `global_documents`
// keys on `(ownerId, documentId)`; the `ownerId` column IS the scope subject, not a stamp (D23). Idempotent:
// a re-attach is a silent no-op (INSERT OR IGNORE, no phantom audit).

import { globalDocuments } from "@orb/db";
import { DocumentNotFoundError } from "../../contract/errors.ts";
import type { GlobalAttachParams } from "../../contract/params.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";
import { loadOwnedMeta } from "../../persistence/queries.ts";

export function createAttachGlobal(ctx: DatabankContext): DatabankService["attachGlobal"] {
  return async ({ principal, documentId }: GlobalAttachParams): Promise<void> => {
    const ownerId = principal.userId;
    const owned = await loadOwnedMeta(ctx.db, ownerId, documentId);
    if (owned === undefined) {
      throw new DocumentNotFoundError(documentId);
    }
    const inserted = await ctx.db
      .insert(globalDocuments)
      .values({ ownerId, documentId })
      .onConflictDoNothing()
      .returning({ documentId: globalDocuments.documentId });
    if (inserted.length === 0) {
      return; // already global — idempotent, no audit
    }
    await ctx.audit({ actorUserId: ownerId, action: "databank.attachGlobal", entityType: "document", entityId: documentId }, ctx.now());
    // Announced only on a REAL scope change: the idempotent re-attach returns above, so a no-op toggle sends
    // nothing (survey H3). The user-bus half is the driver behind the library row's Everywhere toggle on a
    // second tab; the room half is D85 (#2471) — a global document is credited to every room its owner is
    // PRESENTLY SEATED IN, for every co-member, so those rooms' racks just changed. Keyed on the ownerId
    // (`chat_participants`, untouched by this write) so the detach twin shares the lookup.
    await ctx.fanDatabankRoomsForMember(ownerId);
    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });
  };
}
