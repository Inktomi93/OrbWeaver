// domain/search/verbs/similar-art — "more like this avatar": seed-vector top-k over the IMAGE space. Unlike
// the cross-modal `images` verb (which skips CSLS — different cosine scale), this is IMAGE↔IMAGE same-space,
// so `hub_score` CSLS-adjust applies. Seed read is owner-belted on both `characters.ownerId` and
// `assets.ownerId`; a foreign/unknown seed yields an empty result.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { SearchContext } from "../context.ts";
import type { SimilarArtParams } from "../contract/params.ts";
import type { SimilarArtHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { nearestAvatarCharacters, readSeedAvatarVector } from "../persistence/image-nearest.ts";
import { CAPTION_LENS, OWNER_OVERFETCH } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust, relevanceOf } from "../substrate/csls.ts";
import { requireImageSpace } from "../substrate/space.ts";
import { requirePositiveTopN } from "../substrate/top-n.ts";

const DEFAULT_ART_LENS: ImageLens = "image-raw";

export function createSimilarArt(ctx: SearchContext): SearchService["similarArt"] {
  return async (params: SimilarArtParams): Promise<SimilarArtHit[]> => {
    const { ownerId, characterId, topN } = params;
    // THE JOINT-SPACE RULE (§10-3). This verb is seed-vector-only — it embeds nothing — so the fallback
    // costs it just the space tag and the lens: in the captioned-text arm the owner's pictures are caption
    // vectors in their TEXT space and no `image-raw` row exists, so the raw default would read an empty
    // table and report "nothing is similar" about a full library.
    const space = await requireImageSpace(ctx, ownerId);
    requirePositiveTopN(topN, "similarArt");
    const lens = space.via === "embed" ? CAPTION_LENS : (params.lens ?? DEFAULT_ART_LENS);
    const model = space.model;

    const seed = await readSeedAvatarVector(ctx.db, { ownerId, characterId, model, lens });
    if (seed === null) {
      return [];
    }

    const pool = await nearestAvatarCharacters(ctx.db, {
      ownerId,
      queryVector: seed,
      model,
      lens,
      excludeCharacterId: characterId,
      limit: OWNER_OVERFETCH * topN,
    });

    return pool
      .map((r) => ({
        characterId: r.characterId,
        name: r.name,
        avatarHash: r.avatarHash,
        distance: r.distance,
        hubScore: r.hubScore,
        score: cslsAdjust(r.distance, r.hubScore),
      }))
      .sort(
        compareCslsBy(
          (r) => r.distance,
          (r) => r.hubScore,
        ),
      )
      .slice(0, topN)
      .map((r) => ({
        characterId: r.characterId,
        score: r.score,
        relevance: relevanceOf(r.distance),
        name: r.name,
        avatarHash: r.avatarHash,
        lens,
      }));
  };
}
