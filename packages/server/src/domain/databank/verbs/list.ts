// verb: list — the caller's own documents, newest-activity first (updatedAt desc), optionally filtered by
// origin. Owner-scoped in the WHERE (fetchOwned). Canon text is NEVER hauled (charCount is derived in SQL);
// chunk counts come from ONE grouped read over `document_chunks` for the active model. A read: no audit.

import type { ListDocumentsParams } from "../contract/params";
import type { DatabankContext, DatabankService } from "../contract/service";
import type { DocumentView } from "../contract/views";
import { listOwnedMeta, toDocumentView } from "../persistence/queries";

const DEFAULT_LIMIT = 100;
const DEFAULT_OFFSET = 0;

export function createList(ctx: DatabankContext): DatabankService["list"] {
  return async ({ principal, origin, limit, offset }: ListDocumentsParams): Promise<DocumentView[]> => {
    const metas = await listOwnedMeta(ctx.db, principal.userId, {
      limit: limit ?? DEFAULT_LIMIT,
      offset: offset ?? DEFAULT_OFFSET,
      ...(origin !== undefined ? { origin } : {}),
    });
    const counts = await ctx.countChunks({ documentIds: metas.map((m) => m.id), model: ctx.getActiveEmbedSpace().model });
    return metas.map((meta) => toDocumentView(meta, counts.get(meta.id) ?? 0));
  };
}
