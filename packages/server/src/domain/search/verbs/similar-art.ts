// domain/search/verbs/similar-art — "more like this avatar": seed-vector top-k over the IMAGE space. Unlike
// the cross-modal `images` verb (which skips CSLS — different cosine scale), this is IMAGE↔IMAGE same-space,
// so `hub_score` CSLS-adjust applies. Seed read is owner-belted on both `characters.ownerId` and
// `assets.ownerId`; a foreign/unknown seed yields an empty result.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { SimilarArtParams } from "../contract/params";
import type { SimilarArtHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { nearestAvatarCharacters, readSeedAvatarVector } from "../persistence/image-nearest";
import { OWNER_OVERFETCH } from "../substrate/constants";
import { compareCslsBy, cslsAdjust } from "../substrate/csls";

const DEFAULT_ART_LENS: ImageLens = "image-raw";

export function createSimilarArt(ctx: SearchContext): SearchService["similarArt"] {
  return async (params: SimilarArtParams): Promise<SimilarArtHit[]> => {
    const { ownerId, characterId, topN } = params;
    const lens = params.lens ?? DEFAULT_ART_LENS;
    const model = ctx.roleClients.imageEmbedModel;

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
        name: r.name,
        avatarHash: r.avatarHash,
        lens,
      }));
  };
}
