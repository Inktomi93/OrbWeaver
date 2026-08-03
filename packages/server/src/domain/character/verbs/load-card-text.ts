// verb: loadCardText — the embeddings indexer's re-reader for the card-text lens. Deliberately UN-PRINCIPAL
// (D20): the vector substrate carries no `ownerId`, so this trusted SYSTEM-only read is keyed by id alone,
// never exposed on the transport surface. Returns null when the card is gone or synthetic.

import type { CharacterId } from "@orb/kit/ids";
import type { CharacterContext } from "../context.ts";
import type { CharacterService } from "../contract/service.ts";
import { cardOf, loadCharacterRowById } from "../persistence/queries.ts";
import { buildCardEmbedText } from "../substrate/embed-text.ts";

export function createLoadCardText(ctx: CharacterContext): CharacterService["loadCardText"] {
  return async (characterId: CharacterId): Promise<string | null> => {
    const row = await loadCharacterRowById(ctx.db, characterId);
    if (row === undefined || row.synthetic) {
      return null;
    }
    // Char budget sizes off buildCardEmbedText's single-home env-floor window (VLLM_EMBED_MAX_MODEL_LEN);
    // the embed engine's runtime self-report is NOT threaded to this content-hash cap (a window change
    // re-embeds, which is acceptable + rare) — see #14 report's deferred list.
    return buildCardEmbedText(cardOf(row));
  };
}
