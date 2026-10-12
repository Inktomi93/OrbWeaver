import type { CharacterId } from "@orb/kit/ids";
import type { CharacterService } from "../contract/service.ts";

/** Adapt the canon reader's deleted/synthetic null to the indexer's absent-text contract. */
export function createEmbeddableCardText(loadCardText: CharacterService["loadCardText"]): (characterId: CharacterId) => Promise<string | undefined> {
  return async (characterId) => (await loadCardText(characterId)) ?? undefined;
}
