// verb: getCard — the live card for an owned character (the card IS the row; D28 replaces neo's
// resolveCurrentVersion). CONTRACT INVARIANT: returns `null` for not-owned / mid-delete — it NEVER throws.
// Chat/roster/memory inject this and call it per roster member; a `null` is "skip, not an error" (a throw
// would break the roster loop). A read: no audit, no emit.

import type { GetCardParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { cardOf, loadOwnedCharacterRow } from "../persistence/queries";

export function createGetCard(ctx: CharacterContext): CharacterService["getCard"] {
  return async ({ principal, characterId }: GetCardParams) => {
    const row = await loadOwnedCharacterRow(ctx.db, principal.userId, characterId);
    return row === undefined ? null : cardOf(row);
  };
}
