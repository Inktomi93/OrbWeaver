// verb: list — the caller's NON-synthetic characters, sorted per `sort` (default `recent` — §4.5),
// cursor-paged (owner-scoped off `principal.userId`). Synthetic group buckets are excluded in the query. A
// read: no audit, no emit. The canonical accepted tags ride each summary (ONE bulk junction read for the
// whole page — the library tag filter), never an N+1 per row. Mirrors `domain/notifications`'s
// `{items, nextCursor}` page shape; the keyset is SORT-DISCRIMINATED (§4.5 — each sort in `CHARACTER_LIST_SORTS`
// needs its own keyset), so the wire cursor carries its `sort` and a mismatch is REJECTED (never silently
// applied under the wrong keyset — that would return misordered/duplicated rows).

import { CharacterOperationError } from "../contract/errors";
import type {
  CharacterListCursor,
  CharacterListSort,
  ListCharactersParams,
} from "../contract/params";
import type { ListCharactersResult } from "../contract/results";
import type { CharacterContext, CharacterService } from "../contract/service";
import { canonicalTagsFor, listOwnedCharactersWithAvatar, summaryOf } from "../persistence/queries";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_SORT: CharacterListSort = "recent";

/** The list-page row (the inferred persistence reader return — the `fork.ts` named-local precedent; the row
 *  bundle type is file-local to `persistence/` per `types-in-contract`, so the verb names it via the return). */
type CharacterListRow = Awaited<ReturnType<typeof listOwnedCharactersWithAvatar>>[number];

const assertNever = (value: never): never => {
  throw new Error(`unhandled character list sort: ${String(value)}`);
};

/** The keyset of the page's LAST row → the next `cursor` (sort-discriminated). Mirrors the current sort's
 *  ORDER BY exactly (persistence/queries.ts `orderFor`/`keysetFor`) so the next page resumes precisely after
 *  it. `if`-chained per the exhaustive-dispatch discipline (a new sort member fails `tsc` at `assertNever`). */
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
    // A cursor minted under a DIFFERENT sort can't be re-keyed onto this order — reject it loud (a client
    // that changes sort resets its infinite query, so a live mismatch is a threading bug, not a user path).
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
    // A full page means there may be more rows; the cursor is the last row we returned (in this sort's order).
    const last = rows.at(-1);
    const nextCursor =
      rows.length === pageSize && last !== undefined ? nextCursorFor(effectiveSort, last) : null;
    return { items, nextCursor };
  };
}
