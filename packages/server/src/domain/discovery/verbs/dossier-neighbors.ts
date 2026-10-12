import type { DossierSearchDeps } from "../contract/dossier-search.ts";
import type { DiscoveryContext } from "../contract/service.ts";

/** Narrow search hits to discovery's content-only dossier surface. */
export function createDossierNeighbors(deps: DossierSearchDeps): DiscoveryContext["similar"] {
  return async (userId, characterId, topN) =>
    (await deps.similarCharacters({ ownerId: userId, characterId, topN })).map((h) => ({
      characterId: h.characterId,
      name: h.name,
      score: h.score,
      relevance: h.relevance,
      avatarHash: h.avatarHash,
      genre: h.genre,
      tone: h.tone,
      elevatorPitch: h.elevatorPitch,
    }));
}
