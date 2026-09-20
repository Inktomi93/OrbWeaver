// domain/search/verbs/segments — within-chat VERBATIM-segment retrieval (core/Knowledge-Cluster.md §6 within-chat;
// the verbatim lens). Same pipeline as `digests` over `chat_segments`: embed `queryText` → cosine scan
// scoped to `scope.chat` + the embed SPACE + the tiered-bridge `candidates` → CSLS rank → `minScore` floor →
// `retrieveK` top-K cut → optional rerank to `rerankTo` (mode `mixC`). Returns ranked {@link SegmentSearchHit}s.
//
// THE SEGMENT-KEY GAP: the verbatim lens has NO `tier`/`scopedCharacterId` column (it is tier-0 verbatim per
// `(chatId, blockIdx)`). To form a real `BlockKey` (inv 8: ALWAYS a real `CharacterId`, never `''`/NULL) the
// hit is stamped `tier: 0` + the caller's egocentric `scopedCharacterId`. That POV is REQUIRED — absent ⇒ a
// typed `SearchError(SCOPE_REQUIRED)` (flag-don't-fake; we never mint an empty-string sentinel).
//
// A BLOCK IS N ROWS (#172): an over-window block is stored as multiple in-budget CHUNKS, so the scan's pool
// can hold several rows of one block. A hit is keyed by BLOCK, so the pool collapses to each block's
// best-scoring chunk (`collapseSegmentChunks`) before hits are formed — the chunk that matched is the one
// that scored, and one scene never returns twice under the same id.

import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SEARCH_SCOPE_REQUIRED, SearchError } from "../contract/errors.ts";
import type { SegmentsParams } from "../contract/params.ts";
import type { SegmentSearchHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { nearestSegments } from "../persistence/digest-rows.ts";
import { SCOPED_POOL_K } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust } from "../substrate/csls.ts";
import { blockKeyStr, collapseSegmentChunks } from "../substrate/dedupe.ts";
import { SCOPE_INSTRUCTIONS } from "../substrate/instructions.ts";
import { applyRerank } from "../substrate/rerank.ts";
import { requireSpaceModel } from "../substrate/space.ts";

export function createSegments(ctx: SearchContext): SearchService["segments"] {
  return async (params: SegmentsParams): Promise<SegmentSearchHit[]> => {
    if (params.candidates !== undefined && params.candidates.length === 0) {
      return [];
    }
    const scopedCharacterId = params.scopedCharacterId;
    if (scopedCharacterId === undefined) {
      throw new SearchError(SEARCH_SCOPE_REQUIRED, "segments requires an egocentric scopedCharacterId to key the verbatim-lens result");
    }
    const text = params.queryText;
    const rc = await ctx.roleClientsFor(params.ownerId);
    const embedModel = await requireSpaceModel(ctx, params.ownerId, "embed");
    if (text === undefined || text.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "segments requires a queryText to embed + scan");
    }

    const embedded = await rc.embed(text, { inputType: "query", instruction: SCOPE_INSTRUCTIONS.segments.query });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
    }

    const pool = await nearestSegments(ctx.db, {
      queryVector,
      model: embedModel,
      chatIds: [params.scope.chat],
      candidates: params.candidates,
      limit: params.candidates === undefined ? SCOPED_POOL_K : params.candidates.length,
    });

    // A block is N chunk ROWS since #172 (an over-window block is chunked, never truncated), and a
    // `SegmentSearchHit` is keyed by BLOCK — so the pool collapses to each block's best-scoring chunk before
    // it becomes hits. Without this, one scene returns twice under the same `blockKeyStr` id.
    const ranked = collapseSegmentChunks(
      [...pool].sort(
        compareCslsBy(
          (c) => c.distance,
          (c) => c.hubScore,
        ),
      ),
    )
      .filter((r) => 1 - r.distance >= params.minScore)
      .map((r) => {
        const blockKey = { chatId: r.chatId, tier: 0, blockIdx: r.blockIdx, scopedCharacterId };
        return {
          id: blockKeyStr(blockKey),
          blockKey,
          sourceText: r.text,
          distance: r.distance,
          hubScore: r.hubScore,
          score: cslsAdjust(r.distance, r.hubScore),
        };
      })
      .sort(
        compareCslsBy(
          (c) => c.distance,
          (c) => c.hubScore,
        ),
      );

    // Same retrieveK top-K cut + rerankTo mixC cut as the digest lens (one wire — `MemoryQueryOptions`): keep
    // the head of the CSLS-ranked pool, and in mixC cap the reranked result to rerankTo.
    const retrieved = ranked.slice(0, params.retrieveK);
    const ordered =
      params.mode === "mixC" ? await applyRerank(`${SCOPE_INSTRUCTIONS.segments.rerank}\n${text}`, retrieved, rc.rerank, params.rerankTo) : retrieved;

    return ordered.map((c) => ({ blockKey: c.blockKey, score: c.score, text: c.sourceText }));
  };
}
