// Pure view helpers for the character LIST (FINAL-Character §4.3/§4.4/§4.5) — filter chips, the
// categorized group-by-tag fold, and the resume-or-new target map. All pure + structural (they take the
// minimal row/chat shape, not the full tRPC types) so they unit-test without a data layer. The surface
// composes them in RENDER (§5.1 render-only reader taxonomy — no effect keyed on selection/prefs).

import type { TagFolderType } from "@orb/contracts/tag";
import type { CharacterId, ChatId, TagId } from "@orb/kit/ids";
import type { ActiveTagFilterState, TagFilterEntry } from "#lib";

/** The tag shape both filter + group need (a structural subset of `TagView`). */
export interface RowTag {
  readonly id: TagId;
  readonly name: string;
  readonly isHiddenOnCard: boolean;
  /** C9-1d: the tags-as-folders axis. Read HERE (`groupStartsOpen`) — this is the column's one live
   *  consumer; before it, `folderType` was written by the tag editor and read by nothing. */
  readonly folderType: TagFolderType;
}

/** The character shape the filters read (a structural subset of `CharacterSummary`). */
export interface FilterableRow {
  readonly starred: boolean;
  readonly archived: boolean;
  readonly tags: readonly RowTag[];
}

export interface LibraryFilters {
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  /** THREE-STATE tag chips, AND-semantics on BOTH arms: every `include` tag must be on the row and every
   *  `exclude` tag must be off it (§4.5 + the exclusion axis). A tag with no entry is unfiltered. */
  readonly tagFilter: readonly TagFilterEntry[];
}

// A total Record over the ACTIVE states — the exclusion arm's whole semantics in two lines. A fourth
// filter state is a tsc error here rather than a chip that silently passes everything.
const TAG_ENTRY_PASSES: Record<ActiveTagFilterState, (rowHasTag: boolean) => boolean> = {
  include: (rowHasTag) => rowHasTag,
  exclude: (rowHasTag) => !rowHasTag,
};

/** §4.5 chip filter: archived hidden unless opted-in · favorites-only · tag multi-select (include AND
 *  exclude). Order is irrelevant (all conjunctive). Search (name) stays in `filterCharacters`. */
export function filterByChips<T extends FilterableRow>(items: readonly T[], filters: LibraryFilters): readonly T[] {
  return items.filter((item) => {
    if (!filters.showArchived && item.archived) {
      return false;
    }
    if (filters.favoritesOnly && !item.starred) {
      return false;
    }
    return filters.tagFilter.every((entry) => TAG_ENTRY_PASSES[entry.state](item.tags.some((tag) => tag.id === entry.id)));
  });
}

/** A categorized bucket: a visible tag (or the null "Uncategorized" catch-all) + its members. */
export interface TagGroup<T> {
  /** `null` = the Uncategorized bucket (rows with no visible tag). */
  readonly tag: RowTag | null;
  readonly items: readonly T[];
}

/** §4.3 categorized fold: each VISIBLE tag becomes a group; a row with 2+ tags appears under EACH (id-based
 *  selection makes the duplication safe — clicking any instance selects the character). Untagged rows land
 *  in the trailing Uncategorized bucket. Groups sort by tag name (locale), Uncategorized always last. Empty
 *  groups are dropped (a tag no row carries is not a header). */
export function groupByTag<T extends FilterableRow>(items: readonly T[]): readonly TagGroup<T>[] {
  const byTag = new Map<TagId, { tag: RowTag; items: T[] }>();
  const uncategorized: T[] = [];
  for (const item of items) {
    const visible = item.tags.filter((tag) => !tag.isHiddenOnCard);
    if (visible.length === 0) {
      uncategorized.push(item);
      continue;
    }
    for (const tag of visible) {
      const bucket = byTag.get(tag.id);
      if (bucket === undefined) {
        byTag.set(tag.id, { tag, items: [item] });
      } else {
        bucket.items.push(item);
      }
    }
  }
  const groups: TagGroup<T>[] = [...byTag.values()]
    .sort((a, b) => a.tag.name.localeCompare(b.tag.name))
    .map((bucket) => ({ tag: bucket.tag, items: bucket.items }));
  if (uncategorized.length > 0) {
    groups.push({ tag: null, items: uncategorized });
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

/** The chat shape the resume map reads (a structural subset of `ChatSummary`). */
export interface ResumableChat {
  readonly id: ChatId;
  readonly participantCharacterIds: readonly CharacterId[];
  readonly lastMessageAt: number | null;
  readonly updatedAt: number;
}

/** §4.4/§9c reverse read: characterId → the MOST-RECENT chat that includes them (by `lastMessageAt` desc,
 *  `updatedAt` as the tiebreak for never-messaged chats). The row's dual-purpose CTA resumes `get(id)` when
 *  present, else starts new — a pure render derivation over the already-loaded `listChats`, never an effect. */
export function resumeTargets(chats: readonly ResumableChat[]): ReadonlyMap<CharacterId, ChatId> {
  const recencyOf = (c: ResumableChat): number => c.lastMessageAt ?? c.updatedAt;
  const best = new Map<CharacterId, ResumableChat>();
  for (const chat of chats) {
    for (const characterId of chat.participantCharacterIds) {
      const current = best.get(characterId);
      if (current === undefined || recencyOf(chat) > recencyOf(current)) {
        best.set(characterId, chat);
      }
    }
  }
  const map = new Map<CharacterId, ChatId>();
  for (const [characterId, chat] of best) {
    map.set(characterId, chat.id);
  }
  return map;
}
