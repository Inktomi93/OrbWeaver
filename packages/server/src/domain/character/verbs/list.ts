// verb: list — the caller's NON-synthetic characters, newest first (owner-scoped off `principal.userId`).
// Synthetic group buckets are excluded in the query (character.md invariant 3). A read: no audit, no emit.
// The canonical accepted tags ride each summary (ONE bulk junction read for the whole page — tag.md L56:
// the library tag filter), never an N+1 per row.

import type { ListCharactersParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { canonicalTagsFor, listOwnedCharactersWithAvatar, summaryOf } from "../persistence/queries";

export function createList(ctx: CharacterContext): CharacterService["list"] {
  return async ({ principal }: ListCharactersParams) => {
    const rows = await listOwnedCharactersWithAvatar(ctx.db, principal.userId);
    const tagMap = await canonicalTagsFor(
      ctx.db,
      rows.map((r) => r.character.id),
    );
    return rows.map((row) => summaryOf(row, tagMap.get(row.character.id) ?? []));
  };
}
