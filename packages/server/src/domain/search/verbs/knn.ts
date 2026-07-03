// domain/search/verbs/knn — the within-space top-k vector scan: embed the query →
// scan ONE embedding space (the card space, `character_embeddings`) → CSLS hub-adjust → optional
// cross-encoder rerank. The generic retrieval primitive; returns raw {@link SearchHit}s (no display
// enrichment — `find-characters` layers that on top).
//
// The query is embedded into the ACTIVE embed model's space (`roleClients.embedModel`) and the scan is
// filtered to that same `model`, so a query NEVER compares across embedding spaces (providers.md §2b/§11).
// rerank pairs with the SAME embed space (it re-scores the retrieved candidates' card text against the
// query). rerank is OPT-IN; a rerank rejection (incl. the PD-11 hosted not-supported throw) PROPAGATES —
// search owns no silent CSLS fallback (flag-don't-fake).

import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors";
import type { KnnParams } from "../contract/params";
import type { SearchHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { nearestCharacters } from "../persistence/nearest";
import { OWNER_OVERFETCH, RERANK_POOL_FACTOR } from "../substrate/constants";
import { compareCslsBy, cslsAdjust, rerankPoolByScores } from "../substrate/csls";
import { applyRerank } from "../substrate/rerank";

export function createKnn(ctx: SearchContext): SearchService["knn"] {
  return async (params: KnnParams): Promise<SearchHit[]> => {
    const { ownerId, query, topN } = params;

    const embedded = await ctx.roleClients.embed(query, { inputType: "query" });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(
        SEARCH_EMPTY_QUERY,
        "the query embedded to no vector — nothing to scan",
      );
    }

    const pool = await nearestCharacters(ctx.db, {
      ownerId,
      queryVector,
      model: ctx.roleClients.embedModel,
      limit: OWNER_OVERFETCH * topN,
    });

    // `id` is added for the rerank seam (its documents/hits key on a caller id, stable across reordering).
    const ranked = pool
      .map((c) => ({
        id: c.characterId,
        characterId: c.characterId,
        sourceText: c.sourceText,
        distance: c.distance,
        hubScore: c.hubScore,
        score: cslsAdjust(c.distance, c.hubScore),
      }))
      .sort(
        compareCslsBy(
          (c) => c.distance,
          (c) => c.hubScore,
        ),
      );

    const ordered =
      params.rerank === true
        ? await applyRerank(
            query,
            rerankPoolByScores(ranked, RERANK_POOL_FACTOR * topN),
            ctx.roleClients.rerank,
            topN,
          )
        : ranked;

    return ordered.slice(0, topN).map((c) => ({ characterId: c.characterId, score: c.score }));
  };
}
