// verb: update — edit the live card IN PLACE (D28 — always safe; no CAS, no COW). The merge (clear-vs-keep
// semantics) + the identity-flag extraction live in `substrate/card-merge`; here we flatten the merged card
// to a fresh `contentHash`, write the flat row, and emit `character.updated` so the embeddings indexer
// re-embeds. An empty edit re-reads without writing. Throws `CharacterNotFoundError` when not owned/found.

import { cardContentHash } from "#kit/serde/card";
import { CharacterNotFoundError } from "../contract/errors";
import type { UpdateCharacterParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { writeCardInPlace } from "../persistence/card";
import {
  canonicalTagsOf,
  cardOf,
  detailOf,
  ensureAssetOwned,
  loadOwnedCharacterRow,
  loadOwnedCharacterWithAvatar,
} from "../persistence/queries";
import { flagEdits, mergeCard } from "../substrate/card-merge";

export function createUpdate(ctx: CharacterContext): CharacterService["update"] {
  return async ({ principal, characterId, input }: UpdateCharacterParams) => {
    const ownerId = principal.userId;
    const current = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (current === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    if (input.avatarAssetId !== null && input.avatarAssetId !== undefined) {
      // D21 cross-root belt: the FK proves the asset exists, never that it's the caller's.
      await ensureAssetOwned(ctx.db, ownerId, input.avatarAssetId);
    }

    if (Object.keys(input).length > 0) {
      const next = mergeCard(cardOf(current), input);
      const at = ctx.now();
      const written = await writeCardInPlace(ctx.db, characterId, ownerId, {
        ...next,
        contentHash: cardContentHash(next),
        ...flagEdits(input),
      });
      if (!written) {
        throw new CharacterNotFoundError(characterId);
      }

      ctx.emit({ type: "character.updated", characterId });
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "character.update",
          entityType: "character",
          entityId: characterId,
          metadata: { fields: Object.keys(input) },
        },
        at,
      );
    }

    const updated = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, characterId);
    if (updated === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(updated, await canonicalTagsOf(ctx.db, characterId));
  };
}
