// Pure view helpers for the character LIST — the categorized group-by-tag fold
// and the resume-or-new target map. All pure + structural (they take the minimal row/chat shape, not the
// full tRPC types) so they unit-test without a data layer. The surface composes them in RENDER (§5.1
// render-only reader taxonomy — no effect keyed on selection/prefs).
//
// THE CHIP FILTER IS NOT HERE ANY MORE (owner ruling 2026-08-13): `filterByChips` ran the favorites /
// archived / three-state tag predicates over the loaded keyset window, which is a filter over "whatever
// pages happened to be in memory". Those axes are `character.list` query params now
// (`domain/character/verbs/list.ts`), so the semantics they encoded live in SQL beside the search.

import type { TagFolderType } from "@orb/contracts/tag";
import type { CharacterId, ChatId, TagId } from "@orb/kit/ids";

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

/** How recent a chat is FOR RESUME PURPOSES: its last message, or — for a chat that was created and never
 *  spoken in — when it was last touched. A never-messaged chat is still a resumable place. */
function recencyOf(chat: ResumableChat): number {
  return chat.lastMessageAt ?? chat.updatedAt;
}

/** Is `candidate` the better resume target than the one held? A TOTAL order, in three steps (#1503).
 *  Recency alone is not one: two chats with the same `lastMessageAt` (a bulk seed, a same-millisecond pair,
 *  and every never-messaged chat sharing an `updatedAt`) compared EQUAL, and a plain `>` then kept whichever
 *  the list happened to yield first — so the CTA for one character could resume a different chat depending
 *  on how `listChats` was sorted, with nothing on screen explaining the change. `updatedAt` breaks the first
 *  tie (the chat touched more recently is the one you were last in) and the id breaks the last one, so the
 *  answer is a property of the DATA and not of the iteration order. */
function isBetterResume(candidate: ResumableChat, held: ResumableChat): boolean {
  const candidateRecency = recencyOf(candidate);
  const heldRecency = recencyOf(held);
  if (candidateRecency !== heldRecency) {
    return candidateRecency > heldRecency;
  }
  if (candidate.updatedAt !== held.updatedAt) {
    return candidate.updatedAt > held.updatedAt;
  }
  return candidate.id > held.id;
}

/** §4.4/§9c reverse read: characterId → the MOST-RECENT chat that includes them (by `lastMessageAt` desc,
 *  falling back to `updatedAt` for a never-messaged chat, then `updatedAt` and the id as tie-breaks —
 *  `isBetterResume`). The row's dual-purpose CTA resumes `get(id)` when present, else starts new — a pure
 *  render derivation over the already-loaded `listChats`, never an effect. */
export function resumeTargets(chats: readonly ResumableChat[]): ReadonlyMap<CharacterId, ChatId> {
  const best = new Map<CharacterId, ResumableChat>();
  for (const chat of chats) {
    for (const characterId of chat.participantCharacterIds) {
      const current = best.get(characterId);
      if (current === undefined || isBetterResume(chat, current)) {
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
