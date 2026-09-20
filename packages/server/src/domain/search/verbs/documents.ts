// domain/search/verbs/documents — the databank RAG lens (DB5, databank-design/05 §3). Scope-gated cosine
// retrieval over `document_chunks`: resolve the scope allowlist via the INJECTED resolver (databank owns the
// union SQL — search never imports databank), embed the query in the chunks' space, scan, floor, CSLS-adjust,
// optionally rerank, collapse duplicates, cap to k, then RESTORE READING ORDER (group by document, documents
// by best hit, chunks ascending by chunkIdx — a model reads fragments coherently, not as score-order salad).
//
// The empty-allowlist short-circuit is the trigger-discipline mirror: a bankless scope returns [] with ZERO
// embed calls, so a chat with no attached documents does zero databank work per turn, forever.

import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { DocumentSearchParams } from "../contract/params.ts";
import type { DocumentChunkHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { nearestDocumentChunks } from "../persistence/nearest.ts";
import { DEFAULT_DOCUMENT_K, DEFAULT_DOCUMENT_MIN_SCORE, OWNER_OVERFETCH, SCOPED_POOL_K } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust } from "../substrate/csls.ts";
import { collapseByContentHash } from "../substrate/dedupe.ts";
import { SCOPE_INSTRUCTIONS } from "../substrate/instructions.ts";
import { applyRerank } from "../substrate/rerank.ts";
import { requireSpaceModel } from "../substrate/space.ts";

interface DocumentCandidate {
  /** The rerank runner keys on `id`; the chunk id is unique so it doubles as the candidate id. */
  readonly id: string;
  /** applyRerank's scorable text (never null for a real chunk). */
  readonly sourceText: string;
  readonly documentId: DocumentChunkHit["documentId"];
  readonly documentName: string;
  readonly chunkId: DocumentChunkHit["chunkId"];
  readonly chunkIdx: number;
  readonly content: string;
  readonly contentHash: string;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly score: number;
}

/** Group by document (documents ordered by their best-ranked hit = first appearance in the ranked list),
 *  chunks ASCENDING by chunkIdx within each document (databank-design/05 §3.4). `ranked` MUST be best-first. */
function restoreReadingOrder(ranked: readonly DocumentCandidate[]): DocumentChunkHit[] {
  const order: DocumentChunkHit["documentId"][] = [];
  const groups = new Map<DocumentChunkHit["documentId"], DocumentCandidate[]>();
  for (const c of ranked) {
    const existing = groups.get(c.documentId);
    if (existing === undefined) {
      order.push(c.documentId);
      groups.set(c.documentId, [c]);
    } else {
      existing.push(c);
    }
  }
  const out: DocumentChunkHit[] = [];
  for (const documentId of order) {
    const chunks = (groups.get(documentId) ?? []).sort((a, b) => a.chunkIdx - b.chunkIdx);
    for (const c of chunks) {
      out.push({
        documentId: c.documentId,
        documentName: c.documentName,
        chunkId: c.chunkId,
        chunkIdx: c.chunkIdx,
        content: c.content,
        score: c.score,
        contentHash: c.contentHash,
      });
    }
  }
  return out;
}

export function createDocuments(ctx: SearchContext): SearchService["documents"] {
  return async (params: DocumentSearchParams): Promise<DocumentChunkHit[]> => {
    const queryText = params.queryText;
    const rc = await ctx.roleClientsFor(params.ownerId);
    const embedModel = await requireSpaceModel(ctx, params.ownerId, "embed");
    if (queryText.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "documents requires a queryText to embed + scan");
    }
    const k = params.k ?? DEFAULT_DOCUMENT_K;
    const minScore = params.minScore ?? DEFAULT_DOCUMENT_MIN_SCORE;

    // 1. allowlist — resolved by databank (D85: the membership-widened chat union minus the host's per-document
    //    visibility exclusions, or the whole owned bank for a personal scope). Empty ⇒ ZERO embed calls
    //    (the trigger-discipline mirror). A host-hidden document never enters the allowlist, so it never
    //    embeds, ranks, or reaches a prompt.
    const allowlist = await ctx.resolveActiveDocumentIds(params.scope);
    if (allowlist.length === 0) {
      return [];
    }

    // 2. embed the query in the chunks' space.
    const embedded = await rc.embed(queryText, { inputType: "query", instruction: SCOPE_INSTRUCTIONS.documents.query });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
    }

    // 3. scope-belted cosine scan (WHERE document_id IN allowlist AND model AND dim).
    const pool = await nearestDocumentChunks(ctx.db, {
      documentIds: allowlist,
      queryVector,
      model: embedModel,
      dim: queryVector.length,
      limit: Math.min(k * OWNER_OVERFETCH, SCOPED_POOL_K),
    });

    // 4. minScore floor + 5. CSLS hub-adjust (NULL_HUB_FALLBACK keeps it a rank-preserving shift while
    //    discovery has no document-hubness pass — one uniform pipeline, no documents special-case).
    const candidates = pool
      .filter((r) => 1 - r.distance >= minScore)
      .map(
        (r): DocumentCandidate => ({
          id: r.chunkId,
          sourceText: r.content,
          documentId: r.documentId,
          documentName: r.documentName,
          chunkId: r.chunkId,
          chunkIdx: r.chunkIdx,
          content: r.content,
          contentHash: r.contentHash,
          distance: r.distance,
          hubScore: r.hubScore,
          score: cslsAdjust(r.distance, r.hubScore),
        }),
      );
    const ranked = candidates.toSorted(
      compareCslsBy(
        (c) => c.distance,
        (c) => c.hubScore,
      ),
    );

    // 6. optional cross-encoder rerank (default OFF, databank-design/05 §3.5).
    const reordered =
      params.rerank === true ? await applyRerank(`${SCOPE_INSTRUCTIONS.documents.rerank}\n${queryText}`, ranked, rc.rerank, ranked.length) : ranked;

    // 7. collapse duplicate chunks (after rank, before k-cap) → 8. k-cap → 9. reading-order restore.
    const collapsed = collapseByContentHash(reordered);
    return restoreReadingOrder(collapsed.slice(0, k));
  };
}
