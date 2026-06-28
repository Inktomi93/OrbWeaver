// verb: list — the caller's NON-synthetic characters, newest first (owner-scoped off `principal.userId`).
// Synthetic group buckets are excluded in the query (character.md invariant 3). A read: no audit, no emit.

import type { ListCharactersParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { listOwnedCharactersWithAvatar, summaryOf } from "../persistence/queries";

export function createList(ctx: CharacterContext): CharacterService["list"] {
  return async ({ principal }: ListCharactersParams) => {
    const rows = await listOwnedCharactersWithAvatar(ctx.db, principal.userId);
    return rows.map(summaryOf);
  };
}
