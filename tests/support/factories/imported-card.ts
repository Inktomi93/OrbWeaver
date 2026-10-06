import type { ImportedCard } from "@orb/contracts/import";
import type { CharacterId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "../ids.ts";

const ids = createSeededIds();

/** Complete multipart response row; id and hash are required even when a card was deduplicated. */
export function makeImportedCard(overrides: Partial<ImportedCard> = {}): ImportedCard {
  return {
    filename: "card.png",
    characterId: castId<CharacterId>(ids.next(ID_PREFIX.character)),
    created: true,
    importHash: "0".repeat(64),
    ...overrides,
  };
}
