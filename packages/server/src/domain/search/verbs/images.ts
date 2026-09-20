// domain/search/verbs/images — cross-modal text→image retrieval: embed the query text into the shared
// multimodal image space → owner-scoped cosine scan of one image_embeddings lens → raw-distance rank →
// optional caption rerank. THE CSLS-SKIP INVARIANT (must survive verbatim): image_embeddings.hub_score is
// computed from image↔image cosine (~0.6–1.0), but a cross-modal query produces a completely different
// range (~0.05–0.17) — adding hub_score would dominate and INVERT the ranking (verified: generic
// placeholder avatars outrank relevant matches). This verb ranks on raw cosine distance alone, never
// cslsAdjust; hub_score exists on that table only for a future image↔image similarity verb.
//
// A HIT CARRIES ITS PICTURE AND ITS PLACE (side-eye corpus re-pass U4). `hash` rides off the assets row the
// scan already joins, and the avatar's owning character is resolved for the returned page — an image result
// that can be neither seen nor opened is a row pretending to be a result, which is exactly what shipped.

import type { SearchContext } from "../context.ts";
import { SEARCH_EMPTY_QUERY, SearchError } from "../contract/errors.ts";
import type { ImagesParams } from "../contract/params.ts";
import type { ImageSearchHit } from "../contract/results.ts";
import type { ActiveQuerySpace, SearchService } from "../contract/service.ts";
import { resolveAvatarOwners } from "../persistence/display.ts";
import { nearestImages } from "../persistence/image-nearest.ts";
import { CAPTION_LENS, OWNER_OVERFETCH, RERANK_POOL_FACTOR } from "../substrate/constants.ts";
import { relevanceOf, rerankPoolByScores } from "../substrate/csls.ts";
import { applyRerank } from "../substrate/rerank.ts";
import { withActiveQuerySpace } from "../substrate/space.ts";
import { requirePositiveTopN } from "../substrate/top-n.ts";

export function createImages(ctx: SearchContext): SearchService["images"] {
  return async (params: ImagesParams): Promise<ImageSearchHit[]> => {
    const { ownerId, query, topN } = params;
    const rc = await ctx.roleClientsFor(ownerId);
    // THE JOINT-SPACE RULE ON THE READ SIDE (§10-3). An owner with an image-capable embedder searches their
    // image space with an image-embedded query, across whichever lens was asked for. An owner WITHOUT one
    // has their pictures in the text space as captions: the query must be embedded as TEXT and the only
    // lens that exists there is `image-captioned`, so the ask is overridden rather than answered with an
    // empty scan of rows that were never written.
    return await withActiveQuerySpace(ctx, ownerId, "imageEmbed", async (space) => {
      const lens = space.via === "embed" ? CAPTION_LENS : params.lens;
      requirePositiveTopN(topN, "images");
      if (query.trim().length === 0) {
        throw new SearchError(SEARCH_EMPTY_QUERY, "images requires a query text to embed + scan");
      }

      const queryVector = await embedImageQuery(space, query);

      const pool = await nearestImages(ctx.db, {
        ownerId,
        queryVector,
        model: space.model,
        generationId: space.generationId,
        lens,
        limit: OWNER_OVERFETCH * topN,
      });

      const ranked = pool.map((r) => ({
        id: r.assetId,
        assetId: r.assetId,
        hash: r.hash,
        sourceText: r.caption,
        caption: r.caption,
        score: r.distance,
      }));

      const ordered = params.rerank === true ? await applyRerank(query, rerankPoolByScores(ranked, RERANK_POOL_FACTOR * topN), rc.rerank, topN) : ranked;

      // A HIT IS A PICTURE AND A PLACE (side-eye corpus re-pass U4). The hash makes the result renderable; the
      // avatar owner makes it navigable. Resolved AFTER the slice, so the enrichment join is sized by what is
      // actually returned rather than by the overfetch pool.
      const hits = ordered.slice(0, topN);
      const owners = await resolveAvatarOwners(
        ctx.db,
        ownerId,
        hits.map((r) => r.assetId),
      );
      const ownerByAsset = new Map(owners.map((o) => [o.assetId, o]));

      // `score` here IS the raw distance (the CSLS skip above), so the readout derives from it directly.
      return hits.map((r) => {
        const owner = ownerByAsset.get(r.assetId);
        return {
          assetId: r.assetId,
          hash: r.hash,
          characterId: owner?.characterId ?? null,
          characterName: owner?.name ?? null,
          score: r.score,
          relevance: relevanceOf(r.score),
          lens,
          caption: r.caption,
        };
      });
    });
  };
}

async function embedImageQuery(space: ActiveQuerySpace, query: string): Promise<Float32Array> {
  const embedded =
    space.via === "embed" ? await space.connection.embed(query, { inputType: "query" }) : await space.connection.imageEmbed({ kind: "text", input: query });
  const vector = embedded.vectors[0];
  if (vector === null || vector === undefined) {
    throw new SearchError(SEARCH_EMPTY_QUERY, "the query embedded to no vector — nothing to scan");
  }
  return vector;
}
