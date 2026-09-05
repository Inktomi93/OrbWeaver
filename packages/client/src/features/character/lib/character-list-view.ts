// Pure view helpers for the character LIST — the categorized group-by-tag fold. Pure + structural (it takes
// the minimal row shape, not the full tRPC types) so it unit-tests without a data layer. The surface
// composes it in RENDER (§5.1 render-only reader taxonomy — no effect keyed on selection/prefs).
//
// THE RESUME-OR-NEW MAP IS GONE (#1662). `resumeTargets` reverse-indexed a BOUNDED `listChats` page into
// `characterId -> chatId`, which answered about the last 100 rooms: a character outside that window fell
// through to "start a new chat" from a CTA that said resume, and the file's own note called the fix "a new
// server capability, not this lane's". It is `CharacterSummary.lastChatId` now — the SAME total order
// (recency -> updatedAt -> id, #1503) in SQL, over the whole library, on the row the surface already has.
//
// THE CHIP FILTER IS NOT HERE ANY MORE (owner ruling 2026-08-13): `filterByChips` ran the favorites /
// archived / three-state tag predicates over the loaded keyset window, which is a filter over "whatever
// pages happened to be in memory". Those axes are `character.list` query params now
// (`domain/character/verbs/list.ts`), so the semantics they encoded live in SQL beside the search.
//
// …AND NEITHER IS THE GROUPING'S ARITHMETIC (#1696). The fold below was the LAST client-side lens on this
// list: it derived both the buckets AND their counts from the loaded rows, so at 312 characters it grouped
// the ~30 the keyset had paged in and printed the result as library facts. The BUCKETS and their SIZES are
// `character.listTagGroups` now — one census over the same scope the page pages — and this file's job
// shrank to what only the client can do: put the rows it HAS under the headers the server named.

import type { TagFolderType } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";

/** The tag shape the categorized fold reads (a structural subset of `TagView`). */
export interface RowTag {
  readonly id: TagId;
  readonly name: string;
  readonly isHiddenOnCard: boolean;
  /** C9-1d: the tags-as-folders axis. Read HERE (`groupStartsOpen`) — this is the column's one live
   *  consumer; before it, `folderType` was written by the tag editor and read by nothing. */
  readonly folderType: TagFolderType;
}

/** The character shape the categorized fold reads (a structural subset of `CharacterSummary`). */
export interface FilterableRow {
  readonly tags: readonly RowTag[];
}

/** A categorized bucket: a visible tag (or the null "Uncategorized" catch-all), the members this pane has
 *  PAGED IN, and how big the bucket is in the library. */
export interface TagGroup<T> {
  /** `null` = the Uncategorized bucket (rows with no visible tag). */
  readonly tag: RowTag | null;
  /** The LOADED members — a window, and the header says so whenever `total` exceeds it. */
  readonly items: readonly T[];
  /** The bucket's size under the CURRENT LENS, from `character.listTagGroups`. `null` only while that read
   *  is in flight: a count the client derived from `items` is precisely the number #1696 removed, so the
   *  absent case is stated as absent rather than filled in from the page. */
  readonly total: number | null;
}

/** The server's group census, structurally (the client mirrors `ListCharacterTagGroupsResult`'s shape
 *  without importing a server type — the tRPC output is inferred at the hook). */
export interface TagGroupCensus {
  readonly groups: readonly { readonly id: TagId; readonly name: string; readonly folderType: TagFolderType; readonly characters: number }[];
  readonly uncategorized: number;
}

/** Every VISIBLE tag id one row carries. */
function visibleTagIds(item: FilterableRow): readonly TagId[] {
  return item.tags.filter((tag) => !tag.isHiddenOnCard).map((tag) => tag.id);
}

/**
 * §4.3 categorized fold, CENSUS-DRIVEN (#1696).
 *
 * The BUCKETS AND THEIR ORDER ARE THE SERVER'S — every tag at least one MATCHING character carries, most
 * populated first, ties alphabetical — so a header exists for a tag whose members are all still beyond the
 * loaded window, and the counts are the library's rather than the page's. A row with 2+ visible tags appears
 * under EACH of its buckets (id-based selection makes the duplication safe: clicking any instance selects
 * the character). Untagged rows land in the trailing Uncategorized bucket, which is the census's own count,
 * not a subtraction — the group counts cannot sum to the total when a row can be in two of them.
 *
 * `census === null` (the read is still in flight, or the pane is flat and never asked) folds the LOADED rows
 * exactly as this function always did, ordered by name, with `total: null` — a page-shaped answer that says
 * it does not know the library's numbers, rather than one that quietly claims them.
 */
export function groupByTag<T extends FilterableRow>(items: readonly T[], census: TagGroupCensus | null): readonly TagGroup<T>[] {
  const membersByTag = new Map<TagId, T[]>();
  const uncategorized: T[] = [];
  for (const item of items) {
    const visible = visibleTagIds(item);
    if (visible.length === 0) {
      uncategorized.push(item);
      continue;
    }
    for (const tagId of visible) {
      const bucket = membersByTag.get(tagId);
      if (bucket === undefined) {
        membersByTag.set(tagId, [item]);
      } else {
        bucket.push(item);
      }
    }
  }
  if (census === null) {
    return pageLocalGroups(items, membersByTag, uncategorized);
  }
  const groups: TagGroup<T>[] = census.groups.map((group) => ({
    tag: { id: group.id, name: group.name, isHiddenOnCard: false, folderType: group.folderType },
    items: membersByTag.get(group.id) ?? [],
    total: group.characters,
  }));
  if (census.uncategorized > 0) {
    groups.push({ tag: null, items: uncategorized, total: census.uncategorized });
  }
  return groups;
}

/** The PENDING arm's fold — the loaded rows only, name-ordered, with no claim about the library. Kept as a
 *  named function rather than inlined so the census arm above reads as the one this file is about. */
function pageLocalGroups<T extends FilterableRow>(
  items: readonly T[],
  membersByTag: ReadonlyMap<TagId, readonly T[]>,
  uncategorized: readonly T[],
): readonly TagGroup<T>[] {
  const tagById = new Map<TagId, RowTag>();
  for (const item of items) {
    for (const tag of item.tags) {
      if (!tag.isHiddenOnCard) {
        tagById.set(tag.id, tag);
      }
    }
  }
  const groups: TagGroup<T>[] = [...tagById.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tag) => ({ tag, items: membersByTag.get(tag.id) ?? [], total: null }));
  if (uncategorized.length > 0) {
    groups.push({ tag: null, items: uncategorized, total: null });
  }
  return groups;
}

/** C9-1d — does this categorized group render EXPANDED on first paint?
 *
 *  `OPEN` is the tags-as-folders value that means "folder, members stay in the main list" (the
 *  `@orb/contracts/tag` axis docblock), so an OPEN tag's section starts expanded; a plain `NONE` label is
 *  not a folder and starts COLLAPSED — its name + count still read as a header, which is the whole point of
 *  a folder you can scan without opening. That difference is what gives the column a live reader.
 *
 *  The Uncategorized bucket (`null`) has no tag and therefore no folder state: it stays expanded, because a
 *  catch-all nobody can configure must never be a thing the user has to discover how to open.
 *
 *  DEFERRED BY RULING (owner 2026-08-09, `docs/design/parked-options-tag-contract.md` §1d): `CLOSED`'s
 *  hide-until-entered drilldown (back button / breadcrumb) is a browsing-model change and is NOT built —
 *  CLOSED therefore lands in the same collapsed-by-default arm as NONE rather than being scaffolded here.
 *  An EXHAUSTIVE switch (not an `=== "OPEN"` test) is what makes that a DECISION per member: adding a
 *  fourth folder type, or building CLOSED for real, is a tsc error here instead of a silent default. A
 *  switch rather than the mapped Record the Spine's dispatch discipline also allows — the contract's
 *  members are SCREAMING_CASE, and an uppercase object key is a `useNamingConvention` error (the sibling
 *  `tags-model.ts` label table pays the same tax with a Map, which would lose the exhaustiveness). */
export function groupStartsOpen(tag: RowTag | null): boolean {
  if (tag === null) {
    return true;
  }
  switch (tag.folderType) {
    case "OPEN":
      return true;
    case "NONE":
    case "CLOSED":
      return false;
    default:
      return assertNeverFolderType(tag.folderType);
  }
}

function assertNeverFolderType(folderType: never): never {
  throw new Error(`groupStartsOpen: unhandled TagFolderType ${JSON.stringify(folderType)}`);
}
