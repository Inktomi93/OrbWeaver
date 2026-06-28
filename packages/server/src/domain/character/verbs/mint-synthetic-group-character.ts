// verb: mintSyntheticGroupCharacter — find-or-mint the hidden `synthetic=true` `__group__${chatId}`
// character (the scoped-group memory bucket; §11.5 group-chat). Internal + chat-injected: it acts on the
// resolved room `ownerId`, not a request principal. IDEMPOTENT: the per-owner `(ownerId, handle)` unique
// index is the find-or-mint guard — find first; on a concurrent-mint race the INSERT conflict re-finds the
// winner. Never NULL author (always owner-stamped); never emits `character.updated` (synthetic rows are
// filtered from the embed pass).

import { cardContentHash } from "#kit/serde/card";
import { CHARACTER_HANDLE_CONFLICT, CharacterOperationError } from "../contract/errors";
import type { MintGroupCharParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { insertCharacter } from "../persistence/card";
import { findByOwnerHandle } from "../persistence/queries";
import { buildGroupCard, groupHandle } from "../substrate/group-character";

export function createMintSyntheticGroupCharacter(
  ctx: CharacterContext,
): CharacterService["mintSyntheticGroupCharacter"] {
  return async ({ ownerId, chatId }: MintGroupCharParams) => {
    const handle = groupHandle(chatId);
    const existing = await findByOwnerHandle(ctx.db, ownerId, handle);
    if (existing !== undefined) {
      return { characterId: existing.id };
    }

    const characterId = ctx.newCharacterId();
    const card = buildGroupCard();
    try {
      await insertCharacter(ctx.db, {
        id: characterId,
        handle,
        ownerId,
        synthetic: true,
        contentHash: cardContentHash(card),
        createdAt: ctx.now(),
        ...card,
      });
    } catch (err) {
      // Concurrent-mint race: another caller won the unique index — re-find the winner.
      if (err instanceof CharacterOperationError && err.code === CHARACTER_HANDLE_CONFLICT) {
        const raced = await findByOwnerHandle(ctx.db, ownerId, handle);
        if (raced !== undefined) {
          return { characterId: raced.id };
        }
      }
      throw err;
    }
    return { characterId };
  };
}
