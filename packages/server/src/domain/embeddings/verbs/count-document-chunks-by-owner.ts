// verb: countDocumentChunksByOwner — every chunk count in an OWNER's bank, for the active embed space. The
// `countDocumentChunks` twin, owner-scoped instead of id-scoped: that one answers "how many chunks do THESE
// rows have" for a page whose rows are already chosen, this one answers the same question for a caller that
// has not chosen its rows yet.
//
// ITS CONSUMERS ARE DATABANK'S LIBRARY PHASE LENS AND ITS BANK-HEALTH CENSUS (owner ruling 2026-08-13 — every
// lens a paged list offers, and every health claim a surface makes about the bank, is resolved server-side).
// A document's ingest PHASE derives from its canon length, its chunk state and a stall clock; the first and
// third are columns on `documents`, the second lives in `document_chunks`, which databank may not read (D20 /
// Knowledge-Cluster inv 1-2 — the vector-scope-derived import chokepoint lists embeddings · search/persistence
// · chat-memory/persistence · discovery/persistence · the debug probes, and databank is deliberately not among
// them). So the chunk FACT crosses as this injected op and the DERIVATION stays in databank, which is the
// direction the boundary wants: embeddings never learns what a "phase" is.
//
// A read only — no write, no embed. The Map is built HERE (a verb), never in the query layer.

import type { DocumentId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { OwnerChunkCountsParams } from "../contract/params.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { countDocumentChunksByOwner } from "../persistence/queries.ts";

export function createCountDocumentChunksByOwner(ctx: EmbeddingsContext): EmbeddingsService["countDocumentChunksByOwner"] {
  return async (params: OwnerChunkCountsParams): Promise<ReadonlyMap<DocumentId, number>> => {
    const rows = await countDocumentChunksByOwner(ctx.db, params.ownerId, params.model);
    return new Map(rows.map((r) => [r.documentId, r.count]));
  };
}
