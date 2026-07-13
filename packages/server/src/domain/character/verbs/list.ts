// verb: list — the caller's NON-synthetic characters, sorted (default `recent`), cursor-paged. The keyset
// is sort-discriminated: each sort has its own keyset, so a cursor minted under a different sort is
// rejected rather than silently mis-applied (would return misordered/duplicated rows).

import type { CharacterContext } from "../context";
import { CharacterOperationError } from "../contract/errors";
import type {
  CharacterListCursor,
  CharacterListSort,
  ListCharactersParams,
} from "../contract/params";
import type { ListCharactersResult } from "../contract/results";
import type { CharacterService } from "../contract/service";
import { canonicalTagsFor, listOwnedCharactersWithAvatar, summaryOf } from "../persistence/queries";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_SORT: CharacterListSort = "recent";

type CharacterListRow = Awaited<ReturnType<typeof listOwnedCharactersWithAvatar>>[number];

const assertNever = (value: never): never => {
  throw new Error(`unhandled character list sort: ${String(value)}`);
};

function nextCursorFor(sort: CharacterListSort, last: CharacterListRow): CharacterListCursor {
  const { id, name, createdAt, starred, tokenSize } = last.character;
  if (sort === "recent") {
    return { sort: "recent", lastChattedAt: last.lastChattedAt, createdAt, id };
  }
  if (sort === "alpha") {
    return { sort: "alpha", name, id };
  }
  if (sort === "starred") {
    return { sort: "starred", starred, name, id };
  }
  if (sort === "newest") {
    return { sort: "newest", createdAt, id };
  }
  if (sort === "oldest") {
    return { sort: "oldest", createdAt, id };
  }
  if (sort === "mostChats") {
    return { sort: "mostChats", chatCount: last.chatCount, id };
  }
  if (sort === "fewestChats") {
    return { sort: "fewestChats", chatCount: last.chatCount, id };
  }
  if (sort === "largestCards") {
    return { sort: "largestCards", tokenSize, id };
  }
  if (sort === "smallestCards") {
    return { sort: "smallestCards", tokenSize, id };
  }
  return assertNever(sort);
}

export function createList(ctx: CharacterContext): CharacterService["list"] {
  return async ({
    principal,
    cursor,
    limit,
    sort,
  }: ListCharactersParams): Promise<ListCharactersResult> => {
    const effectiveSort = sort ?? DEFAULT_SORT;
    if (cursor !== undefined && cursor.sort !== effectiveSort) {
      throw new CharacterOperationError(
        "cursor_sort_mismatch",
        `list cursor sort '${cursor.sort}' does not match the requested sort '${effectiveSort}'`,
      );
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
    const nextCursor =
      rows.length === pageSize && last !== undefined ? nextCursorFor(effectiveSort, last) : null;
    return { items, nextCursor };
  };
}
