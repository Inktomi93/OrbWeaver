// verb: countDocumentChunks — the DocumentView chunk-count read (per document, active model). embeddings owns
// `document_chunks` (the vector-scope-derived import chokepoint), so the databank domain derives its
// `chunkCount`/`embeddedCount` through this injected op rather than importing the vector table. A read only —
// no write, no embed. Returns a Map keyed by documentId (documents with zero chunks are simply absent → the
// caller defaults them to 0). The Map is built HERE (a verb), never in the query layer.

import type { DocumentId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { CountDocumentChunksParams } from "../contract/params.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { countDocumentChunks } from "../persistence/queries.ts";

export function createCountDocumentChunks(ctx: EmbeddingsContext): EmbeddingsService["countDocumentChunks"] {
  return async (params: CountDocumentChunksParams): Promise<ReadonlyMap<DocumentId, number>> => {
    const rows = await countDocumentChunks(ctx.db, params.documentIds, params.model);
    return new Map(rows.map((r) => [r.documentId, r.count]));
  };
}
