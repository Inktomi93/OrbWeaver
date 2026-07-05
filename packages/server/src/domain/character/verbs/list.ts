// verb: list — the caller's NON-synthetic characters, newest-first, cursor-paged (owner-scoped off
// `principal.userId`). Synthetic group buckets are excluded in the query. A read: no audit, no emit.
// The canonical accepted tags ride each summary (ONE bulk junction read for the whole page — the library
// tag filter), never an N+1 per row. Mirrors `domain/notifications`'s `{items, nextCursor}` page shape;
// the keyset itself mirrors `domain/assets`'s `(sortCol, id)` compound-cursor precedent (`createdAt` alone
// is NOT unique — see persistence/queries.ts header).

import type { CharacterListCursor, ListCharactersParams } from "../contract/params";
import type { ListCharactersResult } from "../contract/results";
import type { CharacterContext, CharacterService } from "../contract/service";
import { canonicalTagsFor, listOwnedCharactersWithAvatar, summaryOf } from "../persistence/queries";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function createList(ctx: CharacterContext): CharacterService["list"] {
  return async ({
    principal,
    cursor,
    limit,
  }: ListCharactersParams): Promise<ListCharactersResult> => {
    const pageSize = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const rows = await listOwnedCharactersWithAvatar(ctx.db, {
      ownerId: principal.userId,
      limit: pageSize,
      cursor: cursor?.createdAt,
      cursorId: cursor?.id,
    });
    const tagMap = await canonicalTagsFor(
      ctx.db,
      rows.map((r) => r.character.id),
    );
    const items = rows.map((row) => summaryOf(row, tagMap.get(row.character.id) ?? []));
    // A full page means there may be older rows; the cursor is the oldest row we returned.
    const last = rows.at(-1)?.character;
    const nextCursor: CharacterListCursor | null =
      rows.length === pageSize && last !== undefined
        ? { createdAt: last.createdAt, id: last.id }
        : null;
    return { items, nextCursor };
  };
}
