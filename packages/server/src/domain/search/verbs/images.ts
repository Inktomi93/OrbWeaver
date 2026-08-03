// domain/search/verbs/images — cross-modal text→image retrieval: embed the query text into the shared
// multimodal image space → owner-scoped cosine scan of one image_embeddings lens → raw-distance rank →
// optional caption rerank. THE CSLS-SKIP INVARIANT (must survive verbatim): image_embeddings.hub_score is
// computed from image↔image cosine (~0.6–1.0), but a cross-modal query produces a completely different
// range (~0.05–0.17) — adding hub_score would dominate and INVERT the ranking (verified: generic
// placeholder avatars outrank relevant matches). This verb ranks on raw cosine distance alone, never
// cslsAdjust; hub_score exists on that table only for a future image↔image similarity verb.

import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { ImagesParams } from "../contract/params.ts";
import type { ImageSearchHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { nearestImages } from "../persistence/image-nearest.ts";
import { OWNER_OVERFETCH, RERANK_POOL_FACTOR } from "../substrate/constants.ts";
import { rerankPoolByScores } from "../substrate/csls.ts";
import { applyRerank } from "../substrate/rerank.ts";

export function createImages(ctx: SearchContext): SearchService["images"] {
  return async (params: ImagesParams): Promise<ImageSearchHit[]> => {
    const { ownerId, query, topN, lens } = params;
    if (query.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "images requires a query text to embed + scan");
    }

    const embedded = await ctx.roleClients.imageEmbed({ kind: "text", input: query });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
    }

    const pool = await nearestImages(ctx.db, {
      ownerId,
      queryVector,
      model: ctx.roleClients.imageEmbedModel,
      lens,
      limit: OWNER_OVERFETCH * topN,
    });

    const ranked = pool.map((r) => ({
      id: r.assetId,
      assetId: r.assetId,
      sourceText: r.caption,
      caption: r.caption,
      score: r.distance,
    }));

    const ordered =
      params.rerank === true ? await applyRerank(query, rerankPoolByScores(ranked, RERANK_POOL_FACTOR * topN), ctx.roleClients.rerank, topN) : ranked;

    return ordered.slice(0, topN).map((r) => ({ assetId: r.assetId, score: r.score, lens, caption: r.caption }));
  };
}
