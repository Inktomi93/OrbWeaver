// domain/search/verbs/segments — within-chat VERBATIM-segment retrieval (knowledge-cluster §6 within-chat;
// the verbatim lens). Same pipeline as `digests` over `chat_segments`: embed `queryText` → cosine scan
// scoped to `scope.chat` + the embed SPACE + the tiered-bridge `candidates` → CSLS rank → `minScore` floor →
// optional rerank (mode `mixC`). Returns ranked {@link SegmentSearchHit}s.
//
// THE SEGMENT-KEY GAP: the verbatim lens has NO `tier`/`scopedCharacterId` column (it is tier-0 verbatim per
// `(chatId, blockIdx)`). To form a real `BlockKey` (inv 8: ALWAYS a real `CharacterId`, never `''`/NULL) the
// hit is stamped `tier: 0` + the caller's egocentric `scopedCharacterId`. That POV is REQUIRED — absent ⇒ a
// typed `SearchError(SCOPE_REQUIRED)` (flag-don't-fake; we never mint an empty-string sentinel).

import { SEARCH_EMPTY_QUERY, SEARCH_SCOPE_REQUIRED, SearchError } from "../contract/errors";
import type { SegmentsParams } from "../contract/params";
import type { SegmentSearchHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { nearestSegments } from "../persistence/digest-rows";
import { SCOPED_POOL_K } from "../substrate/constants";
import { compareCslsBy, cslsAdjust } from "../substrate/csls";
import { blockKeyStr } from "../substrate/dedupe";
import { applyRerank } from "../substrate/rerank";

export function createSegments(ctx: SearchContext): SearchService["segments"] {
  return async (params: SegmentsParams): Promise<SegmentSearchHit[]> => {
    if (params.candidates !== undefined && params.candidates.length === 0) {
      return [];
    }
    const scopedCharacterId = params.scopedCharacterId;
    if (scopedCharacterId === undefined) {
      throw new SearchError(
        SEARCH_SCOPE_REQUIRED,
        "segments requires an egocentric scopedCharacterId to key the verbatim-lens result",
      );
    }
    const text = params.queryText;
    if (text === undefined || text.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "segments requires a queryText to embed + scan");
    }

    const embedded = await ctx.roleClients.embed(text, { inputType: "query" });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(
        SEARCH_EMPTY_QUERY,
        "the query embedded to no vector — nothing to scan",
      );
    }

    const pool = await nearestSegments(ctx.db, {
      queryVector,
      model: ctx.roleClients.embedModel,
      chatIds: [params.scope.chat],
      candidates: params.candidates,
      limit: params.candidates === undefined ? SCOPED_POOL_K : params.candidates.length,
    });

    const ranked = pool
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

    const ordered =
      params.mode === "mixC"
        ? await applyRerank(text, ranked, ctx.roleClients.rerank, ranked.length)
        : ranked;

    return ordered.map((c) => ({ blockKey: c.blockKey, score: c.score, text: c.sourceText }));
  };
}
