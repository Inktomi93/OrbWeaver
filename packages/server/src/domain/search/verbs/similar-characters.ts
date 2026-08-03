// domain/search/verbs/similar-characters — "more like this character": seed-vector top-k over the CARD
// space, using the seed's STORED card embedding (not a re-embed of the card text). Seed read is
// owner-belted; a foreign/unknown/unembedded seed resolves to an empty result, never another tenant's
// neighbourhood. No rerank — the seed is a stored vector, not a query phrase to cross-encode against.

import type { SearchContext } from "../context.ts";
import type { SimilarCharactersParams } from "../contract/params.ts";
import type { CharacterCardHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { resolveCharacterDisplay } from "../persistence/display.ts";
import { nearestCharacters, readSeedCharacterVector } from "../persistence/nearest.ts";
import { OWNER_OVERFETCH } from "../substrate/constants.ts";
import { compareCslsBy, cslsAdjust } from "../substrate/csls.ts";

export function createSimilarCharacters(ctx: SearchContext): SearchService["similarCharacters"] {
  return async (params: SimilarCharactersParams): Promise<CharacterCardHit[]> => {
    const { ownerId, characterId, topN } = params;

    const seed = await readSeedCharacterVector(ctx.db, ownerId, characterId);
    if (seed === null) {
      return [];
    }

    const pool = await nearestCharacters(ctx.db, {
      ownerId,
      queryVector: seed.embedding,
      model: seed.model,
      excludeCharacterId: characterId,
      limit: OWNER_OVERFETCH * topN,
    });

    const ranked = pool
      .map((c) => ({
        characterId: c.characterId,
        distance: c.distance,
        hubScore: c.hubScore,
        score: cslsAdjust(c.distance, c.hubScore),
      }))
      .sort(
        compareCslsBy(
          (c) => c.distance,
          (c) => c.hubScore,
        ),
      )
      .slice(0, topN);

    const displays = await resolveCharacterDisplay(
      ctx.db,
      ownerId,
      ranked.map((r) => r.characterId),
    );
    const byId = new Map(displays.map((d) => [d.characterId, d]));

    return ranked.flatMap((r) => {
      const display = byId.get(r.characterId);
      if (display === undefined) {
        return [];
      }
      return [
        {
          characterId: r.characterId,
          score: r.score,
          name: display.name,
          avatarHash: display.avatarHash,
          genre: display.genre,
          tone: display.tone,
          elevatorPitch: display.elevatorPitch,
        },
      ];
    });
  };
}
