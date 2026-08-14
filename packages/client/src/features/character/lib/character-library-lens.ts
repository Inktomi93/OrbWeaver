// The character library's LENS derivations — pure, DOM-free, and unit-tested without a browser
// (Spine-Testing.md §7). They turn the pane's persisted view-prefs into `character.list` query input and
// turn the server's answer back into the readout the pane speaks.
//
// They live here rather than in the surface for the reason the whole feature was reworked on 2026-08-13:
// these three decisions (what the wire asks for · what the chips offer · what the count claims) are the
// ones that were quietly wrong while the library filtered a ≤150-row client window, and each of them is
// worth a test that does not need a mounted pane.

import type { TagWithUsage } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import type { ActiveTagFilterState, TagFilterEntry } from "#lib";

/** One entry of the tag-filter chip vocabulary. */
export interface LibraryChipTag {
  readonly id: TagId;
  readonly name: string;
}

/** What the filter row's live region says — how many characters the current search + chips MATCH, which is
 *  the server's census over the whole library, not the rows this pane happens to have paged in.
 *
 *  When fewer are loaded than match, it says BOTH ("30 of 412 characters"): the census alone would read as a
 *  claim about what is on screen, and the loaded count alone is the number this list stopped being able to
 *  print honestly the day it went keyset-paged. Before the first page lands there is no census — the loaded
 *  count is then the only true thing to say. */
export function resultCountLabel(loaded: number, totalCount: number | null): string {
  const noun = (n: number): string => `character${n === 1 ? "" : "s"}`;
  if (totalCount === null || totalCount === loaded) {
    return `${String(loaded)} ${noun(loaded)}`;
  }
  return `${String(loaded)} of ${String(totalCount)} ${noun(totalCount)}`;
}

/**
 * REFERENTIAL INTEGRITY FOR THE PERSISTED FILTER (staleness-and-session-freshness.md §4.2.2, W5) — the tag
 * ids the owner's library actually contains, i.e. the AUTHORITY a persisted `tagFilter` entry is checked
 * against. `null` from {@link effectiveTagFilter}'s caller means the authority has not resolved yet.
 *
 * Hidden-on-card tags are IN: a tag being hidden on a card is a display decision about the card, not a claim
 * that the tag stopped existing — filtering by one is still a filter that can match. (Which is also why
 * {@link tagVocabulary} pins an ACTIVE hidden tag into the chip row: known ⟺ named, one authority, so a chip
 * can never say "Deleted tag" about an id that is still narrowing the list.)
 */
export function knownTagIds(library: readonly TagWithUsage[]): ReadonlySet<TagId> {
  return new Set(library.map((tag) => tag.id));
}

/**
 * THE EFFECTIVE FILTER — the persisted entries MINUS every id the authority does not know. This is the fix
 * for the owner's import repro (design doc D1): `tagFilter` persists raw `TagId`s with no existence check, the
 * server's tag predicate is AND-semantics on both arms, and an include-id belonging to a deleted tag (or to a
 * previous dev era's db) therefore matches ZERO rows and empties the whole library — invisibly, and surviving
 * every reload, because the blob outlives the identity that wrote it. A reference that can NEVER match must
 * never veto: the recent-models picker's live-pool drop (`credentials/lib/model-picker-model.ts`
 * `resolveRecentEntries`) is the same rule for the same reason, one surface earlier.
 *
 * PURE, and DROPPED rather than PRUNED: the entry stays in the store (so the chip row still renders it,
 * clearable — "a filter you cannot see is a filter you cannot turn off"), it just stops reaching the wire. No
 * write-on-render, so §5.1's render-only reader taxonomy holds.
 *
 * `known === null` = THE AUTHORITY HAS NOT ANSWERED YET (the tag-library read is still in flight). The entries
 * pass through unchanged, deliberately: the alternative — treating "not loaded" as "not known" — would drop
 * every LIVE filter on first paint, flash the unfiltered library, and re-key the collection query on every
 * boot. Trusting the blob until the authority lands costs a second fetch only in the rare poisoned case.
 */
export function effectiveTagFilter(entries: readonly TagFilterEntry[], known: ReadonlySet<TagId> | null): readonly TagFilterEntry[] {
  return known === null ? entries : entries.filter((entry) => known.has(entry.id));
}

/** The tag ids sitting in ONE of the chip states, SORTED — the wire's include/exclude lists. Sorted because
 *  the stored entry order follows the CLICK order, and an order-sensitive query key would refetch the whole
 *  keyset run when a user cycles two chips in the other sequence. */
export function tagIdsInState(entries: readonly TagFilterEntry[], state: ActiveTagFilterState): readonly TagId[] {
  return entries
    .filter((entry) => entry.state === state)
    .map((entry) => entry.id)
    .toSorted((a, b) => a.localeCompare(b));
}

/** The tag-filter chip vocabulary — the OWNER'S tag library (`tag.listTagsWithUsage`), ranked MOST-USED
 *  FIRST (ties alphabetical), hidden-on-card tags dropped, and tags no character carries dropped too (a
 *  chip that can only ever empty the list is not a filter, it is a trap).
 *
 *  IT USED TO BE DERIVED FROM THE LOADED ROWS, and that was the dead-filter defect (design doc D1): the
 *  vocabulary GREW as pages arrived, and an active filter whose tag was on no loaded row rendered NO CHIP at
 *  all — an invisible filter emptying the library with no way to clear it but wiping localStorage. Sourced
 *  from the server, the row set can no longer hide a chip; `tagFilter` keeps the last case honest by pinning
 *  an ACTIVE tag into the vocabulary even at zero usage — and, since W5, even when it is hidden-on-card,
 *  because {@link knownTagIds} counts a hidden tag as EXISTING and therefore still filtering: a chip that
 *  read "Deleted tag" while its id was narrowing the list would be the invisible-filter defect wearing a
 *  label. (A tag deleted from the library entirely is the chips component's own "Deleted tag" arm — it has no
 *  row here to be pinned from, and W5 makes it inert.)
 *
 *  The ranking is what makes the chip row's cap honest (side-eye 2026-08-03 P2): the row shows the first N,
 *  so the filters that can DO the most sit in the visible slice, where alphabetical order put whatever
 *  started with "a". `usage.characters` counts the whole library now, not the loaded window. */
export function tagVocabulary(library: readonly TagWithUsage[], tagFilter: readonly TagFilterEntry[]): readonly LibraryChipTag[] {
  const activeIds = new Set(tagFilter.map((entry) => entry.id));
  return library
    .filter((tag) => activeIds.has(tag.id) || (!tag.isHiddenOnCard && tag.usage.characters > 0))
    .toSorted((a, b) => b.usage.characters - a.usage.characters || a.name.localeCompare(b.name))
    .map((tag) => ({ id: tag.id, name: tag.name }));
}
