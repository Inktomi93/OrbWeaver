// verb: list — the caller's NON-synthetic characters, sorted (default `recent`), cursor-paged. The keyset
// is sort-discriminated: each sort has its own keyset, so a cursor minted under a different sort is
// rejected rather than silently mis-applied (would return misordered/duplicated rows).
//
// EVERY LENS IS SERVER-SIDE (owner ruling 2026-08-13: "if i search then it should not just search on virtual
// stuff yeah? same for sort etc"). Search, the favorites/archived toggles and the three-state tag chips are
// all predicates on the SAME scope the keyset windows and `totalCount` counts — the library used to filter a
// ≤150-row client window, so a term that matched nothing on the loaded pages read as "no matches" over a
// library of hundreds. `sort` was already a server keyset; the filters now compose with it.

import { CHARACTER_LIST_DEFAULT_LIMIT } from "@orb/contracts/character";
import type { CharacterContext } from "../context.ts";
import { CharacterOperationError } from "../contract/errors.ts";
import type { CharacterListCursor, CharacterListSort, ListCharactersParams } from "../contract/params.ts";
import type { ListCharactersResult } from "../contract/results.ts";
import type { CharacterService } from "../contract/service.ts";
import type { CharacterListFilter } from "../persistence/queries.ts";
import { canonicalTagsFor, countOwnedCharacters, listOwnedCharactersWithAvatar, summaryOf } from "../persistence/queries.ts";

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
    case "bestScore":
      return { sort: "bestScore", score: last.refineryScore, id };
    case "worstScore":
      return { sort: "worstScore", score: last.refineryScore, id };
    default:
      return assertNever(sort);
  }
}

/** The request's LENS axes, normalized ONCE (the `listChats` precedent): the search predicate is a
 *  `lower(...) like`, so the needle has to arrive trimmed + lowercased, and a whitespace-only query is the
 *  UNSEARCHED library rather than a search for a space. An empty include/exclude list is likewise ABSENCE,
 *  never a predicate that matches nothing — and an omitted boolean stays omitted, because `starred`/
 *  `archived` are tri-state (absent = unfiltered, which is what the lookup-map callers read). */
function lensFilterOf(params: ListCharactersParams): CharacterListFilter {
  const { search, starred, archived, includeTagIds, excludeTagIds } = params;
  const needle = search?.trim().toLowerCase() ?? "";
  return {
    ...(needle === "" ? {} : { search: needle }),
    ...(starred === undefined ? {} : { starred }),
    ...(archived === undefined ? {} : { archived }),
    ...(includeTagIds === undefined || includeTagIds.length === 0 ? {} : { includeTagIds }),
    ...(excludeTagIds === undefined || excludeTagIds.length === 0 ? {} : { excludeTagIds }),
  };
}

export function createList(ctx: CharacterContext): CharacterService["list"] {
  return async (params: ListCharactersParams): Promise<ListCharactersResult> => {
    const { principal, cursor, limit, sort } = params;
    const effectiveSort = sort ?? DEFAULT_SORT;
    if (cursor !== undefined && cursor.sort !== effectiveSort) {
      throw new CharacterOperationError("cursor_sort_mismatch", `list cursor sort '${cursor.sort}' does not match the requested sort '${effectiveSort}'`);
    }
    const filter = lensFilterOf(params);
    // No clamp here: the CEILING is a transport refusal now (`CHARACTER_LIST_MAX_LIMIT`), so an over-bound
    // ask never reaches this verb. Silently trimming it was how four lookup-map callers spent months asking
    // for 200-500 rows, receiving 100, and under-covering the library without a single signal.
    const pageSize = limit ?? CHARACTER_LIST_DEFAULT_LIMIT;
    const rows = await listOwnedCharactersWithAvatar(ctx.db, {
      ...filter,
      ownerId: principal.userId,
      limit: pageSize,
      sort: effectiveSort,
      cursor,
    });
    // A second, separate COUNT over the SAME filter rather than a derivation from `items`: the pane's live
    // region and the list band both PRINT this number, and "how many rows this page happened to carry" is
    // not that number.
    const totalCount = await countOwnedCharacters(ctx.db, principal.userId, filter);
    const tagMap = await canonicalTagsFor(
      ctx.db,
      rows.map((r) => r.character.id),
    );
    const items = rows.map((row) => summaryOf(row, tagMap.get(row.character.id) ?? []));
    const last = rows.at(-1);
    const nextCursor = rows.length === pageSize && last !== undefined ? nextCursorFor(effectiveSort, last) : null;
    return { items, nextCursor, totalCount };
  };
}
