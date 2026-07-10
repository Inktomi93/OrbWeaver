// verb: mintSyntheticGroupCharacter — find-or-mint the hidden `synthetic=true` `__group__${chatId}`
// character (the scoped-group memory bucket; §11.5 group-chat). Internal + chat-injected: it acts on the
// resolved room `ownerId`, not a request principal. IDEMPOTENT: the per-owner `(ownerId, handle)` unique
// index is the find-or-mint guard — find first; on a concurrent-mint race the INSERT conflict re-finds the
// winner. Never NULL author (always owner-stamped); never emits `character.updated` (synthetic rows are
// filtered from the embed pass).

import { cardContentHash } from "#kit/serde/card";
import {
  CHARACTER_HANDLE_CONFLICT,
  CHARACTER_HANDLE_RESERVED,
  CharacterOperationError,
} from "../contract/errors";
import type { MintGroupCharParams } from "../contract/params";
import type { CharacterRef } from "../contract/results";
import type { CharacterContext, CharacterService } from "../contract/service";
import { insertCharacter } from "../persistence/card";
import { findByOwnerHandle } from "../persistence/queries";
import { cardTokenSize } from "../substrate/card-tokens";
import { buildGroupCard, groupHandle } from "../substrate/group-character";

/** Adopt an EXISTING row on the reserved handle as the group identity — but ONLY if it is synthetic. A
 *  non-synthetic squatter is refused loudly (create/update now refuse this namespace, so this is defense-in-
 *  depth; `findSyntheticGroupCharacter` guards the same way — the mint must never author narrator turns / file
 *  shared digests under a real user card). Extracted to keep the verb closure under the complexity gate. */
function adoptSynthetic(
  row: { readonly id: CharacterRef["characterId"]; readonly synthetic: boolean },
  handle: string,
): CharacterRef {
  if (row.synthetic) {
    return { characterId: row.id };
  }
  throw new CharacterOperationError(
    CHARACTER_HANDLE_RESERVED,
    `handle "${handle}" is occupied by a non-synthetic character`,
  );
}

export function createMintSyntheticGroupCharacter(
  ctx: CharacterContext,
): CharacterService["mintSyntheticGroupCharacter"] {
  return async ({ ownerId, chatId }: MintGroupCharParams) => {
    const handle = groupHandle(chatId);
    const existing = await findByOwnerHandle(ctx.db, ownerId, handle);
    if (existing !== undefined) {
      return adoptSynthetic(existing, handle);
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
        tokenSize: cardTokenSize(card),
        createdAt: ctx.now(),
        ...card,
      });
    } catch (err) {
      // Concurrent-mint race: another caller won the unique index — re-find the winner.
      if (err instanceof CharacterOperationError && err.code === CHARACTER_HANDLE_CONFLICT) {
        const raced = await findByOwnerHandle(ctx.db, ownerId, handle);
        // The winner is another mint's synthetic row (only the mint inserts into this namespace) — guard it.
        if (raced !== undefined && raced.synthetic) {
          return { characterId: raced.id };
        }
      }
      throw err;
    }
    return { characterId };
  };
}
