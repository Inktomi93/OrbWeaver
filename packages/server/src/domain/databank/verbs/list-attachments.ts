// verb: listAttachments — where an owned document is attached (the CONTEXT panel's "Active in" roster + the
// detach UX). Owner-gated (`loadOwnedMeta` — you only see your own document's attachments); the reverse
// `*_document_idx` on each junction serves the three lookups. A read: no audit.
//
// TWO SCOPES, TWO AUTHORITIES (#276). The character names come off the owner-scoped join in persistence —
// the caller owns both sides of that junction. The rooms do NOT: chats carry no `ownerId` (D18) and
// `attachToChat` is HOST authority, so a `chat_documents` row outlives the attacher's seat and a raw id
// list would let this pane name rooms the caller was kicked out of. They go through chat's injected
// `resolveVisibleRooms` — PRESENT membership only, unresolvable rooms simply ABSENT (no residue, no count
// of what was dropped: a "…and 2 more" is the same leak one integer smaller). The same op, the same
// contract shape and the same composition-root factory the regex library's roster uses.
//
// The resolver is skipped entirely when the junction is empty — an unattached document asks chat nothing.

import { DocumentNotFoundError } from "../contract/errors.ts";
import type { GetDocumentParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import type { DocumentAttachmentsView } from "../contract/views.ts";
import { loadAttachments, loadOwnedMeta } from "../persistence/queries.ts";

export function createListAttachments(ctx: DatabankContext): DatabankService["listAttachments"] {
  return async ({ principal, id }: GetDocumentParams): Promise<DocumentAttachmentsView> => {
    const owned = await loadOwnedMeta(ctx.db, principal.userId, id);
    if (owned === undefined) {
      throw new DocumentNotFoundError(id);
    }
    const rows = await loadAttachments(ctx.db, principal.userId, id);
    const chats = rows.chatIds.length === 0 ? [] : await ctx.resolveVisibleRooms(principal, rows.chatIds);
    return { global: rows.global, chats, characters: rows.characters };
  };
}
