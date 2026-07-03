// verb: loadCardText — the embeddings indexer's canon re-reader for the card-text lens. UN-PRINCIPAL by
// design (D20): the vector substrate carries NO `ownerId`, so the indexer (a trusted SYSTEM consumer, never a
// user-facing surface) re-reads the card by the branded id the `character.updated` event carried, with NO
// owner scope and NO `can()`/ownership gate. This is the deliberate exception to "every USER-facing verb gates
// on principal.userId" — there is no principal here; the read is keyed by id alone (`loadCharacterRowById`).
// It is NOT a security hole: it is a trusted internal re-read, wired only into the embeddings indexer at the
// composition root, never exposed on the transport surface.
//
// Returns the canonical card-text PROJECTION (`substrate/embed-text`) — the SAME text the indexer embeds —
// or `null` when the card is gone (deleted between the emit and the handler) OR synthetic (group memory
// buckets have no real card text and are never embedded; the synthetic mint never
// emits, so this is belt-and-suspenders for a standalone system read). A read: no audit, no emit.

import type { CharacterId } from "@orb/kit/ids";
import type { CharacterContext, CharacterService } from "../contract/service";
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
