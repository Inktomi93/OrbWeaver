// verb: listForCharacter — the books attached to an owned character, primary first then newest. Carries the
// per-attachment role. Gates character ownership (`ensureCharacterOwned`). A read: no audit.

import type { ListForCharacterParams } from "#src/domain/world-info/contract/params.ts";
import type { WorldInfoContext, WorldInfoService } from "#src/domain/world-info/contract/service.ts";
import { ensureCharacterOwned } from "#src/domain/world-info/persistence/ownership.ts";
import { listCharacterBooks } from "#src/domain/world-info/persistence/queries.ts";

export function createListForCharacter(ctx: WorldInfoContext): WorldInfoService["listForCharacter"] {
  return async ({ principal, characterId }: ListForCharacterParams) => {
    const ownerId = principal.userId;
    await ensureCharacterOwned(ctx.db, ownerId, characterId);
    return listCharacterBooks(ctx.db, ownerId, characterId);
  };
}
