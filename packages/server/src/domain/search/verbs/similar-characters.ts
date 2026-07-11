// domain/search/verbs/similar-characters — "more like this character" (PD-35): seed-vector top-k over the
// CARD space. Reads the seed character's STORED card embedding (NOT a re-embed of the card text — that would
// cross the query/document instruction spaces and re-embed on every view) → scans the SAME space excluding
// the seed → CSLS hub-adjust → enriches like `findCharacters` (returns `CharacterCardHit`s). This
// deliberately realizes the docs' `findCharacters`-shorthand as a seed-vector verb (search-deferred §4.4).
//
// THE SEED READ IS OWNER-BELTED (`characters.ownerId`, D20) — a foreign/unknown/unembedded seed resolves to
// `null` ⇒ an EMPTY result, never another tenant's neighbourhood (the neo V2-2 cross-tenant-seed lesson;
// carried here as defense in depth even though the tRPC seam already owner-scopes). No rerank: there is no
// query text to cross-encode against (the seed is a stored vector, not a phrase).

import type { SimilarCharactersParams } from "../contract/params";
import type { CharacterCardHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { resolveCharacterDisplay } from "../persistence/display";
import { nearestCharacters, readSeedCharacterVector } from "../persistence/nearest";
import { OWNER_OVERFETCH } from "../substrate/constants";
import { compareCslsBy, cslsAdjust } from "../substrate/csls";

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
