// verb: list — the caller's NON-synthetic characters, sorted (default `recent`), cursor-paged. The keyset
// is sort-discriminated: each sort has its own keyset, so a cursor minted under a different sort is
// rejected rather than silently mis-applied (would return misordered/duplicated rows).

import type { CharacterContext } from "../context.ts";
import { CharacterOperationError } from "../contract/errors.ts";
import type { CharacterListCursor, CharacterListSort, ListCharactersParams } from "../contract/params.ts";
import type { ListCharactersResult } from "../contract/results.ts";
import type { CharacterService } from "../contract/service.ts";
import { canonicalTagsFor, listOwnedCharactersWithAvatar, summaryOf } from "../persistence/queries.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_SORT: CharacterListSort = "recent";

type CharacterListRow = Awaited<ReturnType<typeof listOwnedCharactersWithAvatar>>[number];

const assertNever = (value: never): never => {
  throw new Error(`unhandled character list sort: ${String(value)}`);
};

function nextCursorFor(sort: CharacterListSort, last: CharacterListRow): CharacterListCursor {
  const { id, name, createdAt, starred, tokenSize } = last.character;
  switch (sort) {
    case "recent":
      return { sort: "recent", lastChattedAt: last.lastChattedAt, createdAt, id };
    case "alpha":
      return { sort: "alpha", name, id };
    case "starred":
      return { sort: "starred", starred, name, id };
    case "newest":
      return { sort: "newest", createdAt, id };
    case "oldest":
      return { sort: "oldest", createdAt, id };
    case "mostChats":
      return { sort: "mostChats", chatCount: last.chatCount, id };
    case "fewestChats":
      return { sort: "fewestChats", chatCount: last.chatCount, id };
    case "largestCards":
      return { sort: "largestCards", tokenSize, id };
    case "smallestCards":
      return { sort: "smallestCards", tokenSize, id };
    default:
      return assertNever(sort);
  }
}

export function createList(ctx: CharacterContext): CharacterService["list"] {
  return async ({ principal, cursor, limit, sort }: ListCharactersParams): Promise<ListCharactersResult> => {
    const effectiveSort = sort ?? DEFAULT_SORT;
    if (cursor !== undefined && cursor.sort !== effectiveSort) {
      throw new CharacterOperationError("cursor_sort_mismatch", `list cursor sort '${cursor.sort}' does not match the requested sort '${effectiveSort}'`);
    }
    const pageSize = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const rows = await listOwnedCharactersWithAvatar(ctx.db, {
      ownerId: principal.userId,
      limit: pageSize,
      sort: effectiveSort,
      cursor,
    });
    const tagMap = await canonicalTagsFor(
      ctx.db,
      rows.map((r) => r.character.id),
    );
    const items = rows.map((row) => summaryOf(row, tagMap.get(row.character.id) ?? []));
    const last = rows.at(-1);
    const nextCursor = rows.length === pageSize && last !== undefined ? nextCursorFor(effectiveSort, last) : null;
    return { items, nextCursor };
  };
}
