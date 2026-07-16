// verb: findSyntheticGroupCharacter — look up the synthetic group character for a room, or `null` if not yet
// minted. Internal + chat-injected (acts on the resolved room `ownerId`). Guards `synthetic` so a real card
// that somehow occupied the namespace is never mistaken for the bucket. A read: no audit, no emit.

import type { CharacterContext } from "../context";
import type { FindGroupCharParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { findByOwnerHandle } from "../persistence/queries";
import { groupHandle } from "../substrate/group-character";

export function createFindSyntheticGroupCharacter(ctx: CharacterContext): CharacterService["findSyntheticGroupCharacter"] {
  return async ({ ownerId, chatId }: FindGroupCharParams) => {
    const row = await findByOwnerHandle(ctx.db, ownerId, groupHandle(chatId));
    if (row === undefined || !row.synthetic) {
      return null;
    }
    return { characterId: row.id };
  };
}
