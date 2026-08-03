// verb: listAttachments — where an owned document is attached (the panel's "attached to" chips + detach UX).
// Owner-gated (`loadOwnedMeta` — you only see your own document's attachments); the reverse `*_document_idx`
// on each junction serves the three lookups. A read: no audit.

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
    return loadAttachments(ctx.db, id);
  };
}
