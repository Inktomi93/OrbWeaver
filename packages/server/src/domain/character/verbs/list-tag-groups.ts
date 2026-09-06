// verb: listTagGroups — the library's GROUP-BY-TAG census, over the SAME lens `list` pages (#1696).
//
// WHY IT EXISTS. The categorized view folds the LOADED rows into buckets, and at 312 characters that meant
// grouping the 30 the keyset had paged in: measured on the owner's library, `Group by tag` produced
// `ADVENTURE 1 · CAN BE WHOLESOME, CAN BE SEXY 2 · FANTASY 1 · UNCATEGORIZED 27` — four counts summing to
// the page, presented as library facts, re-forming under the reader as scrolling pulled more rows. The
// paged-lens law (owner ruling 2026-08-14) is that once a list is windowed, every lens on it is a server
// query or it silently means "of whatever is loaded"; group-by-tag was the last client-side one.
//
// IT RE-OPENS A RECORDED REFUSAL, AND THE RULING SURVIVES — ITS INPUT CHANGED. #493 considered server-side
// group counts and refused them, in `character-categorized-list.tsx`'s own header, for two stated reasons:
// the available census (`tag.listTagFilterVocabulary`) counts the WHOLE library rather than the current
// search + chip lens, and there is no census at all for the Uncategorized bucket — "printing a lens-blind
// census beside lens-filtered members would be a second wrong answer with more authority than the first".
// Both disqualifiers are facts about THAT census, not about the idea, and this verb has neither: it counts
// through `ownedCharacterScope`, the same predicate the page and `totalCount` share, and it answers the
// uncategorized bucket as a first-class member. #493's honest-caveat arm is not discarded either — what
// survives is the per-GROUP loaded-vs-total statement, which is now sayable per bucket rather than as one
// blanket disclaimer over all of them.
//
// NO SORT, NO CURSOR, NO LIMIT. A census is not a page; every one of those three is a way to make the answer
// window-dependent again, which is the whole defect. The buckets' MEMBERS still come from the paged list —
// this verb answers "what buckets exist and how big are they", which is the half the client cannot know.

import type { CharacterContext } from "../context.ts";
import type { CharacterListFilter, ListCharacterTagGroupsParams } from "../contract/params.ts";
import type { ListCharacterTagGroupsResult } from "../contract/results.ts";
import type { CharacterService } from "../contract/service.ts";
import { countOwnedCharactersByVisibleTag, countOwnedCharactersWithoutVisibleTag } from "../persistence/queries.ts";

/** The request's LENS axes, normalized exactly as `list` normalizes them — same trim/lowercase for the
 *  search needle, same "an empty include/exclude list is ABSENCE", same tri-state booleans. Spelled here
 *  rather than imported from `list.ts` because a verb does not import a sibling verb; what must not drift is
 *  the PREDICATE, and that is `ownedCharacterScope`, which both reads share. */
function lensFilterOf(params: ListCharacterTagGroupsParams): CharacterListFilter {
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

export function createListTagGroups(ctx: CharacterContext): CharacterService["listTagGroups"] {
  return async (params: ListCharacterTagGroupsParams): Promise<ListCharacterTagGroupsResult> => {
    const filter = lensFilterOf(params);
    // TWO COUNTS, not one and a subtraction: a character with two visible tags is counted in both of its
    // groups, so the group counts do not sum to the matched total and `totalCount − sum` would go negative
    // on a well-tagged library. Sequential rather than concurrent — these are two cheap indexed aggregates
    // on the same connection, and the pair has no ordering hazard worth a `Promise.all`'s partial-failure
    // shape.
    const groups = await countOwnedCharactersByVisibleTag(ctx.db, params.principal.userId, filter);
    const uncategorized = await countOwnedCharactersWithoutVisibleTag(ctx.db, params.principal.userId, filter);
    return { groups, uncategorized };
  };
}
