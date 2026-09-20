// verb: get — one owned document by id (owner-scoped fetchOwned). Throws `DocumentNotFoundError` when it
// doesn't exist OR isn't the caller's — the two collapse into one answer (no foreign-existence leak). The
// canon `extractedText` is returned ONLY when `includeText` (the panel's source view); `chunkCount` is derived
// from the live `document_chunks` rows for the active model. A read: no audit.

import { DocumentNotFoundError } from "../contract/errors.ts";
import type { GetDocumentParams } from "../contract/params.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import type { DocumentDetailView } from "../contract/views.ts";
import { loadOwnedDocument, toDocumentView } from "../persistence/queries.ts";
import { activeSpaceModel } from "../substrate/active-space.ts";

export function createGet(ctx: DatabankContext): DatabankService["get"] {
  return async ({ principal, id, includeText }: GetDocumentParams): Promise<DocumentDetailView> => {
    const row = await loadOwnedDocument(ctx.db, principal.userId, id);
    if (row === undefined) {
      throw new DocumentNotFoundError(id);
    }
    const counts = await ctx.countChunks({ documentIds: [id], model: await activeSpaceModel(ctx, principal.userId) });
    const base = toDocumentView(
      {
        id: row.id,
        name: row.name,
        mime: row.mime,
        origin: row.origin,
        sourceUrl: row.sourceUrl,
        byteSize: row.byteSize,
        charCount: row.extractedText.length,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      counts.get(id) ?? 0,
    );
    return { ...base, extractorVersion: row.extractorVersion, ...(includeText === true ? { extractedText: row.extractedText } : {}) };
  };
}
