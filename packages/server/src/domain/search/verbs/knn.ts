// domain/search/verbs/knn — within-space top-k vector scan: embed the query → scan ONE embedding space
// (`character_embeddings`) → CSLS hub-adjust → optional cross-encoder rerank. Query and scan always use the
// SAME embed model, so a query never compares across embedding spaces. rerank is opt-in; a rejection
// propagates rather than silently falling back.

import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { KnnParams } from "../contract/params.ts";
import type { SearchHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { nearestCharacters } from "../persistence/nearest.ts";
import { OWNER_OVERFETCH, RERANK_POOL_FACTOR } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust, relevanceOf, rerankPoolByScores } from "../substrate/csls.ts";
import { applyRerank } from "../substrate/rerank.ts";
import { requireSpaceModel } from "../substrate/space.ts";
import { requirePositiveTopN } from "../substrate/top-n.ts";

export function createKnn(ctx: SearchContext): SearchService["knn"] {
  return async (params: KnnParams): Promise<SearchHit[]> => {
    const { ownerId, query, topN } = params;
    const rc = await ctx.roleClientsFor(ownerId);
    const embedModel = await requireSpaceModel(rc, "embed");
    // The same two refusals `discover`/`digests` make, in the verb `findCharacters` delegates its whole
    // retrieval to. A blank query is not a scan with no results — the embedder is asked for a vector for
    // nothing, and whatever it returns ranks the corpus by noise.
    if (query.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "knn requires a query to embed + scan");
    }
    requirePositiveTopN(topN, "knn");

    const embedded = await rc.embed(query, { inputType: "query" });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
    }

    const pool = await nearestCharacters(ctx.db, {
      ownerId,
      queryVector,
      model: embedModel,
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

    const ordered = params.rerank === true ? await applyRerank(query, rerankPoolByScores(ranked, RERANK_POOL_FACTOR * topN), rc.rerank, topN) : ranked;

    return ordered.slice(0, topN).map((c) => ({ characterId: c.characterId, score: c.score, relevance: relevanceOf(c.distance) }));
  };
}
