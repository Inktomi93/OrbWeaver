// verb: loadCardText — the embeddings indexer's re-reader for the card-text lens. Deliberately UN-PRINCIPAL
// (D20): the vector substrate carries no `ownerId`, so this trusted SYSTEM-only read is keyed by id alone,
// never exposed on the transport surface. Returns null when the card is gone or synthetic.

import type { CharacterId } from "@orb/kit/ids";
import type { CharacterContext } from "../context";
import type { CharacterService } from "../contract/service";
import { cardOf, loadCharacterRowById } from "../persistence/queries";
import { buildCardEmbedText } from "../substrate/embed-text";

export function createLoadCardText(ctx: CharacterContext): CharacterService["loadCardText"] {
  return async (characterId: CharacterId): Promise<string | null> => {
    const row = await loadCharacterRowById(ctx.db, characterId);
    if (row === undefined || row.synthetic) {
      return null;
    }
    return buildCardEmbedText(cardOf(row));
  };
}
