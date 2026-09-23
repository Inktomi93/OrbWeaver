// The character library's LENS derivations — pure, DOM-free, and unit-tested without a browser
// (Spine-Testing.md §7). They turn the pane's persisted view-prefs into `character.list` query input and
// turn the server's answer back into the readout the pane speaks.
//
// They live here rather than in the surface for the reason the whole feature was reworked on 2026-08-13:
// these three decisions (what the wire asks for · what the chips offer · what the count claims) are the
// ones that were quietly wrong while the library filtered a ≤150-row client window, and each of them is
// worth a test that does not need a mounted pane.

import type { TagFilterVocabularyEntry } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import type { ActiveTagFilterState, TagFilterEntry } from "#lib";

/** Keystroke→request damper for the server-side library search — ONE constant, applied by each consumer
 *  that turns the stored raw text into a query (the pane's collection AND the LIST band's census, #518), so
 *  the rows and the band's number settle on the same keystroke instead of a quarter-second apart. Long
 *  enough that typing a name is one round trip rather than eight, short enough that the list answers while
 *  you are still looking. The `chat-list-scope.ts` twin is the shape this mirrors. */
export const CHARACTER_SEARCH_DEBOUNCE_MS = 250;

/** One entry of the tag-filter chip vocabulary. */
export interface LibraryChipTag {
  readonly id: TagId;
  readonly name: string;
}

/** What the filter row's live region says — how many characters the current search + chips MATCH, which is
 *  the server's census over the whole library, not the rows this pane happens to have paged in. Before the
 *  first page lands there is no census — the loaded count is then the only true thing to say.
 *
 *  IT USED TO PRINT BOTH NUMBERS ("30 of 412 characters"), AND THE RULING SURVIVES — ITS INPUT CHANGED
 *  (#493, side-eye 2026-08-22 rail-characters P2-1). The ruling was that the loaded count alone is a number
 *  this list stopped being able to print honestly the day it went keyset-paged, and the census alone reads
 *  as a claim about what is on screen. The second half died on the owner's real library: at rest the line
 *  read `30 of 327 characters` — the PAGE SIZE (`character.list {limit:30}`) worded as a result count —
 *  230px under a band already reading `CHARACTERS 327`, whose natural reading is "only 30 of your
 *  characters match". It is false, and it is the resting state, so it is the state everyone sees.
 *
 *  What is preserved: the number here is the SERVER's census, never the loaded rows, and the loaded-vs-
 *  census signal is not lost — it MOVES to the foot of the list, beside the tail-fetch sentinel, where
 *  "how much of it have I got" is the question being asked ({@link loadedProgressLabel}). */
export function resultCountLabel(loaded: number, totalCount: number | null): string {
  const matched = totalCount ?? loaded;
  return `${String(matched)} character${matched === 1 ? "" : "s"}`;
}

/** The FOOT of the list: how much of the matched set is paged in, beside the tail-fetch sentinel. `null`
 *  once everything is loaded (or before the census lands) — a progress line with nothing left to report is
 *  noise, and it is the one place a loaded count is a fact about the list rather than a claim about the
 *  library. */
export function loadedProgressLabel(loaded: number, totalCount: number | null): string | null {
  return totalCount === null || loaded >= totalCount ? null : `${String(loaded)} of ${String(totalCount)} loaded`;
}

// `partialGroupingLabel` USED TO LIVE HERE and is gone with the defect it described (#1696). It was the
// blanket caveat over the categorized view — "the counts below are this page's, not the library's" — which
// was the honest thing to say while the counts really were the page's. The counts are the server's census
// now (`character.listTagGroups`), so a sentence disclaiming them would be false; what survives of #493's
// ruling is the PER-BUCKET loaded-vs-total note, which `character-categorized-list.tsx` renders from the
// group's own numbers and therefore needs no derivation here.

/**
 * REFERENTIAL INTEGRITY FOR THE PERSISTED FILTER (D138) — the tag
 * ids the owner's library actually contains, i.e. the AUTHORITY a persisted `tagFilter` entry is checked
 * against. `null` from {@link effectiveTagFilter}'s caller means the authority has not resolved yet.
 *
 * Hidden-on-card tags are IN: a tag being hidden on a card is a display decision about the card, not a claim
 * that the tag stopped existing — filtering by one is still a filter that can match. (Which is also why
 * {@link tagVocabulary} pins an ACTIVE hidden tag into the chip row: known ⟺ named, one authority, so a chip
 * can never say "Deleted tag" about an id that is still narrowing the list.)
 */
export function knownTagIds(library: readonly TagFilterVocabularyEntry[]): ReadonlySet<TagId> {
  return new Set(library.map((tag) => tag.id));
}

/**
 * THE EFFECTIVE FILTER — the persisted entries MINUS every id the authority does not know. This is the fix
 * for the owner's import repro (design doc D1): `tagFilter` persists raw `TagId`s with no existence check, the
 * server's tag predicate is AND-semantics on both arms, and an include-id belonging to a deleted tag (or to a
 * previous dev era's db) therefore matches ZERO rows and empties the whole library — invisibly, and surviving
 * every reload, because the blob outlives the identity that wrote it. A reference that can NEVER match must
 * never veto.
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

/** The tag-filter chip vocabulary — the OWNER'S tag library (`tag.listTagFilterVocabulary`), hidden-on-card
 *  tags dropped, and tags no character carries dropped too (a chip that can only ever empty the list is not
 *  a filter, it is a trap). MOST-USED FIRST, ties alphabetical — and that ranking is now the SERVER's
 *  (`listOwnedTagFilterVocabulary` sorts; this filter is order-preserving), so the rank has one author
 *  instead of a client re-sort of a server order.
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
/**
 * THE EXPANDED VOCABULARY'S ORDER + INDEX (side-eye 2026-08-17 P1). The chip rail's disclosure used to
 * render the whole vocabulary back into the wrapping rail — 551 chips, a 5,957px wall, the character list
 * driven to zero height. It renders into a BOUNDED SCROLLER now, and a bounded scroller re-opens the exact
 * hole the cap was minted against: an ACTIVE chip 400 entries down is a filter you cannot see.
 *
 * So the panel's order is not the rail's. Two rules, in this order:
 *   1. ACTIVE entries lead — every chip that is currently narrowing the library sits above the fold.
 *   2. everything else keeps the caller's most-used-first ranking (`tagVocabulary`'s).
 * `toSorted` is stable, so rule 2 costs nothing to state: the comparator only ever separates the two
 * classes.
 *
 * `query` is the panel's search box — a case-insensitive NAME substring, trimmed, `""` meaning unfiltered.
 * 551 entries is a vocabulary rather than a list, and the only way to operate one is to index it.
 */
export function vocabularyPanelTags(tags: readonly LibraryChipTag[], tagFilter: readonly TagFilterEntry[], query: string): readonly LibraryChipTag[] {
  const needle = query.trim().toLocaleLowerCase();
  const active = new Set(tagFilter.map((entry) => entry.id));
  const matched = needle === "" ? tags : tags.filter((tag) => tag.name.toLocaleLowerCase().includes(needle));
  return matched.toSorted((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)));
}

export function tagVocabulary(library: readonly TagFilterVocabularyEntry[], tagFilter: readonly TagFilterEntry[]): readonly LibraryChipTag[] {
  const activeIds = new Set(tagFilter.map((entry) => entry.id));
  return library.filter((tag) => activeIds.has(tag.id) || (!tag.isHiddenOnCard && tag.characters > 0)).map((tag) => ({ id: tag.id, name: tag.name }));
}
