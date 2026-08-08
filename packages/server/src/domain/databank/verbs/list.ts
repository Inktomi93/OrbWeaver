// verb: list — the caller's own documents, newest-activity first (updatedAt desc, id desc), optionally
// filtered by origin, CURSOR-PAGED. Owner-scoped in the WHERE (fetchOwned). Canon text is NEVER hauled
// (charCount is derived in SQL); chunk counts come from ONE grouped read over `document_chunks` for the
// active model. A read: no audit.
//
// PAGING IS KEYSET, not offset (the `character.list` precedent): the cursor is the boundary row's own
// `(updatedAt, id)`. `nextCursor` is that pair when a FULL page came back (there may be more below it) and
// `null` otherwise — the exhausted-bank signal the client's "Load more" reads. Before this, the verb served
// one 100-row page and nothing could ask for the next one, so a bank's 101st document was unreachable from
// every surface (the ceiling the "100+" honesty made visible).

import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
import type { ListDocumentsParams } from "../contract/params.ts";
import type { ListDocumentsResult } from "../contract/results.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import { listOwnedMeta, toDocumentView } from "../persistence/queries.ts";

// The default page size lives in `@orb/contracts/databank`: a client surface that SUMMARIZES the returned
// rows has to know the page it was served to say "100+" instead of reporting a page as a census.
// The ceiling is the same number — it mirrors `UserSettings.library.pageSize`'s own max, so the paging
// surface can never ask for a page the verb will silently shrink.
const MAX_LIMIT = DATABANK_LIST_DEFAULT_LIMIT;

export function createList(ctx: DatabankContext): DatabankService["list"] {
  return async ({ principal, origin, limit, cursor }: ListDocumentsParams): Promise<ListDocumentsResult> => {
    const pageSize = Math.min(limit ?? DATABANK_LIST_DEFAULT_LIMIT, MAX_LIMIT);
    const metas = await listOwnedMeta(ctx.db, principal.userId, {
      limit: pageSize,
      ...(cursor !== undefined ? { cursor } : {}),
      ...(origin !== undefined ? { origin } : {}),
    });
    const counts = await ctx.countChunks({ documentIds: metas.map((m) => m.id), model: ctx.getActiveEmbedSpace().model });
    const items = metas.map((meta) => toDocumentView(meta, counts.get(meta.id) ?? 0));
    const last = metas.at(-1);
    // A full page means there MAY be more below it; a short page is the end of the bank.
    const nextCursor = metas.length === pageSize && last !== undefined ? { updatedAt: last.updatedAt, id: last.id } : null;
    return { items, nextCursor };
  };
}
