// verb: list — the caller's own documents, newest-activity first (updatedAt desc), optionally filtered by
// origin. Owner-scoped in the WHERE (fetchOwned). Canon text is NEVER hauled (charCount is derived in SQL);
// chunk counts come from ONE grouped read over `document_chunks` for the active model. A read: no audit.

import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
import type { ListDocumentsParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import type { DocumentView } from "../contract/views.ts";
import { listOwnedMeta, toDocumentView } from "../persistence/queries.ts";

// The default page size lives in `@orb/contracts/databank`: a client surface that SUMMARIZES the returned
// rows has to know the page it was served to say "100+" instead of reporting a page as a census.
const DEFAULT_OFFSET = 0;

export function createList(ctx: DatabankContext): DatabankService["list"] {
  return async ({ principal, origin, limit, offset }: ListDocumentsParams): Promise<DocumentView[]> => {
    const metas = await listOwnedMeta(ctx.db, principal.userId, {
      limit: limit ?? DATABANK_LIST_DEFAULT_LIMIT,
      offset: offset ?? DEFAULT_OFFSET,
      ...(origin !== undefined ? { origin } : {}),
    });
    const counts = await ctx.countChunks({ documentIds: metas.map((m) => m.id), model: ctx.getActiveEmbedSpace().model });
    return metas.map((meta) => toDocumentView(meta, counts.get(meta.id) ?? 0));
  };
}
