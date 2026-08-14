// domain/search/verbs/find-characters — character-card vector search with distilled-facet enrichment:
// the primitive `discovery` consumes for similarity browsing / archetype
// grouping. It is `knn` (the within-space card scan + CSLS + optional rerank) PLUS a `character_summaries`
// + avatar JOIN — so the retrieval pipeline has ONE home (`knn`) and this verb only layers display.
//
// `knn` is injected at the composition root (`service.ts`), NOT re-implemented or sideways-imported — the
// retrieval ranking lives in exactly one place. A character that vanished between the scan and the enrich
// (deleted, or filtered by the owner re-assert) is simply dropped from the result.

import type { SearchContext } from "../context.ts";
import type { FindCharactersParams } from "../contract/params.ts";
import type { CharacterCardHit } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { resolveCharacterDisplay } from "../persistence/display.ts";

export function createFindCharacters(ctx: SearchContext, knn: SearchService["knn"]): SearchService["findCharacters"] {
  return async (params: FindCharactersParams): Promise<CharacterCardHit[]> => {
    const hits = await knn(params);
    if (hits.length === 0) {
      return [];
    }

    const displays = await resolveCharacterDisplay(
      ctx.db,
      params.ownerId,
      hits.map((h) => h.characterId),
    );
    const byId = new Map(displays.map((d) => [d.characterId, d]));

    return hits.flatMap((hit) => {
      const display = byId.get(hit.characterId);
      if (display === undefined) {
        return [];
      }
      return [
        {
          characterId: hit.characterId,
          score: hit.score,
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
