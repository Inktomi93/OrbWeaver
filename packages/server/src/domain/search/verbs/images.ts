// domain/search/verbs/images — cross-modal text→image retrieval (PD-36): embed the query TEXT into the
// shared multimodal image space (`imageEmbed({ kind: "text" })`) → owner-scoped cosine scan of ONE
// `image_embeddings` lens → RAW-distance rank → optional caption cross-encoder rerank. Returns
// {@link ImageSearchHit}s (the owned asset + its cross-modal distance).
//
// ── THE CSLS-SKIP INVARIANT (must survive verbatim — PD-36 / knowledge-cluster esoteric #2) ──────────────
// `image_embeddings.hub_score` is computed from image↔image cosine (~0.6–1.0 scale). A cross-modal
// text→image query produces cosine similarities in a COMPLETELY DIFFERENT range (~0.05–0.17). Adding
// `hub_score` into the cross-modal distance (`cslsAdjust`) DOMINATES the ranking and INVERTS the order —
// verified against a 309-card corpus, generic placeholder avatars (high hub) outrank the relevant matches.
// So this verb ranks on the RAW cosine distance ALONE and never calls `cslsAdjust`. `hub_score` exists on
// that table only for a FUTURE image↔image similarity verb (same space, hub applies there). Pinned by a
// test asserting a hub-dominant outlier (a blank/generic avatar) does not outrank a relevant match.
//
// The query is embedded into the ACTIVE image-embed space (`roleClients.imageEmbedModel`) and the scan is
// filtered to that same `model` + the requested `lens`, so a query never compares across spaces/lenses.
// rerank is OPT-IN over the CAPTION pool (the `image-captioned` lens' text); a raw-lens hit has no caption
// and is a recall-preserving passthrough (`applyRerank` unscorable path). A rerank rejection (incl. the
// PD-11 hosted not-supported throw) PROPAGATES — search owns no silent fallback.

import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors";
import type { ImagesParams } from "../contract/params";
import type { ImageSearchHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { nearestImages } from "../persistence/image-nearest";
import { OWNER_OVERFETCH, RERANK_POOL_FACTOR } from "../substrate/constants";
import { rerankPoolByScores } from "../substrate/csls";
import { applyRerank } from "../substrate/rerank";

export function createImages(ctx: SearchContext): SearchService["images"] {
  return async (params: ImagesParams): Promise<ImageSearchHit[]> => {
    const { ownerId, query, topN, lens } = params;
    if (query.trim().length === 0) {
      throw new SearchError(SEARCH_EMPTY_QUERY, "images requires a query text to embed + scan");
    }

    const embedded = await ctx.roleClients.imageEmbed({ kind: "text", input: query });
    const queryVector = embedded.vectors[0];
    if (queryVector === null || queryVector === undefined) {
      throw new SearchError(
        SEARCH_EMPTY_QUERY,
        "the query embedded to no vector — nothing to scan",
      );
    }

    const pool = await nearestImages(ctx.db, {
      ownerId,
      queryVector,
      model: ctx.roleClients.imageEmbedModel,
      lens,
      limit: OWNER_OVERFETCH * topN,
    });

    // RAW cosine distance is the score (NO cslsAdjust — the CSLS-skip invariant above). The scan already
    // returns ascending-by-distance, so the pool is best-first. `id`/`sourceText` feed the rerank seam.
    const ranked = pool.map((r) => ({
      id: r.assetId,
      assetId: r.assetId,
      sourceText: r.caption,
      caption: r.caption,
      score: r.distance,
    }));

    const ordered =
      params.rerank === true
        ? await applyRerank(
            query,
            rerankPoolByScores(ranked, RERANK_POOL_FACTOR * topN),
            ctx.roleClients.rerank,
            topN,
          )
        : ranked;

    return ordered
      .slice(0, topN)
      .map((r) => ({ assetId: r.assetId, score: r.score, lens, caption: r.caption }));
  };
}
