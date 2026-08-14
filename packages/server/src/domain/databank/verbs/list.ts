// verb: list — the caller's own documents, newest-activity first (updatedAt desc, id desc), CURSOR-PAGED,
// with EVERY lens the library offers applied SERVER-SIDE. Owner-scoped in the WHERE (fetchOwned). Canon text
// is NEVER hauled (charCount is derived in SQL); chunk counts come from ONE grouped read over
// `document_chunks` for the active model. A read: no audit.
//
// EVERY LENS IS SERVER-SIDE (owner ruling 2026-08-13, the `character.list` precedent): name search, the
// origin facet and the ingest-PHASE scope are predicates on the SAME scope the keyset windows and
// `totalCount` counts. The library used to filter a ≤150-row sliding window of loaded pages by name and by
// phase, so a term — or a health chip a user had just clicked on the home tile — that matched nothing among
// the loaded rows read as "no matches" over a bank of hundreds, and the pane had to hedge with "None among
// the loaded documents". The hedge is gone because the claim is now true.
//
// PAGING IS KEYSET, not offset: the cursor is the boundary row's own `(updatedAt, id)`. `nextCursor` is that
// pair when a FULL page came back (there may be more below it) and `null` otherwise — the exhausted-bank
// signal the "Load more" tail reads.
//
// THE PHASE LENS COSTS ONE EXTRA READ, and only when a chip is on. Phase is derived from the canon length,
// the chunk state and a stall clock; the first and third are columns here, but `document_chunks` is not
// databank's to read (D20 / Knowledge-Cluster inv 1-2 — the `vector-scope-derived` chokepoint does not list
// this domain, deliberately). So the chunk half arrives as an id set through the injected
// `listChunkedDocumentIds` op and the derivation stays here.
//   DECLARED LIMIT: that id set is bound one parameter per chunked document, so a bank past SQLite's ~32k
//   variable ceiling would fail the phase-filtered read (the unfiltered list, search and origin are
//   unaffected). ESCALATION, if such a bank ever exists: give embeddings a PHASE-FACTS read of its own so the
//   predicate never leaves SQL — never a `vector-scope-derived` allowlist row for databank.

import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
import type { DocumentListFilter, ListDocumentsParams } from "../contract/params.ts";
import type { ListDocumentsResult } from "../contract/results.ts";
import type { DatabankContext, DatabankService } from "../contract/service.ts";
import { countOwnedDocuments, listOwnedMeta, toDocumentView } from "../persistence/queries.ts";

// The default page size lives in `@orb/contracts/databank`: a client surface that SUMMARIZES the returned
// rows has to know the page it was served. The ceiling is the same number — it mirrors
// `UserSettings.library.pageSize`'s own max, so the paging surface can never ask for a page the verb will
// silently shrink.
const MAX_LIMIT = DATABANK_LIST_DEFAULT_LIMIT;

/** The request's LENS axes, normalized ONCE (the `listChats` / `character.list` precedent). The search
 *  predicate is a `lower(...) like`, so the needle has to arrive trimmed + lowercased, and a whitespace-only
 *  query is the UNSEARCHED bank rather than a search for a space. The phase axis additionally resolves the
 *  two facts SQL cannot reach on its own — the chunked id set and the stall clock — which is why it is the
 *  one arm that costs a read. */
async function lensFilterOf(ctx: DatabankContext, params: ListDocumentsParams): Promise<DocumentListFilter> {
  const { principal, search, origin, phase } = params;
  const needle = search?.trim().toLowerCase() ?? "";
  if (phase === undefined) {
    return {
      ...(needle === "" ? {} : { search: needle }),
      ...(origin === undefined ? {} : { origin }),
    };
  }
  // The KEY SET is the whole fact this needs — "is this document chunked at all". The op returns counts
  // because its other consumer (the health census) sums them; a second id-only op would be a second read of
  // one table for one question.
  const chunkedIds = [...(await ctx.chunkCountsByOwner({ ownerId: principal.userId, model: ctx.getActiveEmbedSpace().model })).keys()];
  return {
    ...(needle === "" ? {} : { search: needle }),
    ...(origin === undefined ? {} : { origin }),
    phase: { phase, chunkedIds, nowMs: ctx.now() },
  };
}

export function createList(ctx: DatabankContext): DatabankService["list"] {
  return async (params: ListDocumentsParams): Promise<ListDocumentsResult> => {
    const { principal, limit, cursor } = params;
    const pageSize = Math.min(limit ?? DATABANK_LIST_DEFAULT_LIMIT, MAX_LIMIT);
    const filter = await lensFilterOf(ctx, params);
    const metas = await listOwnedMeta(ctx.db, principal.userId, {
      filter,
      limit: pageSize,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    // A second, separate COUNT over the SAME filter rather than a derivation from `items`: the band header
    // and the home tile PRINT this number, and "how many rows this page happened to carry" is not it.
    const totalCount = await countOwnedDocuments(ctx.db, principal.userId, filter);
    const counts = await ctx.countChunks({ documentIds: metas.map((m) => m.id), model: ctx.getActiveEmbedSpace().model });
    const items = metas.map((meta) => toDocumentView(meta, counts.get(meta.id) ?? 0));
    const last = metas.at(-1);
    // A full page means there MAY be more below it; a short page is the end of the bank.
    const nextCursor = metas.length === pageSize && last !== undefined ? { updatedAt: last.updatedAt, id: last.id } : null;
    return { items, nextCursor, totalCount };
  };
}
