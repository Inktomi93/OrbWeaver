// domain/search/verbs/knn — within-space top-k vector scan: embed the query → scan ONE embedding space
// (`character_embeddings`) → CSLS hub-adjust → optional cross-encoder rerank. Query and scan always use the
// SAME embed model, so a query never compares across embedding spaces. rerank is opt-in; a rejection
// propagates rather than silently falling back.

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
