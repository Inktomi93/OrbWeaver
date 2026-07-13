// verb: listForCharacter — the books attached to an owned character, primary first then newest. Carries the
// per-attachment role. Gates character ownership (`ensureCharacterOwned`). A read: no audit.

import type { WorldInfoContext } from "../../context";
import type { ListForCharacterParams } from "../../contract/params";
import type { WorldInfoService } from "../../contract/service";
import { ensureCharacterOwned } from "../../persistence/ownership";
import { listCharacterBooks } from "../../persistence/queries";

export function createListForCharacter(
  ctx: WorldInfoContext,
): WorldInfoService["listForCharacter"] {
  return async ({ principal, characterId }: ListForCharacterParams) => {
    const ownerId = principal.userId;
    await ensureCharacterOwned(ctx.db, ownerId, characterId);
    return listCharacterBooks(ctx.db, ownerId, characterId);
  };
}
