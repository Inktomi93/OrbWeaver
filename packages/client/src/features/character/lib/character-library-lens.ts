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
 *  an ACTIVE tag into the vocabulary even at zero usage. (A tag deleted from the library entirely is the
 *  chips component's own "Deleted tag" arm — it has no row here to be pinned from.)
 *
 *  The ranking is what makes the chip row's cap honest (side-eye 2026-08-03 P2): the row shows the first N,
 *  so the filters that can DO the most sit in the visible slice, where alphabetical order put whatever
 *  started with "a". `usage.characters` counts the whole library now, not the loaded window. */
export function tagVocabulary(library: readonly TagWithUsage[], tagFilter: readonly TagFilterEntry[]): readonly LibraryChipTag[] {
  const activeIds = new Set(tagFilter.map((entry) => entry.id));
  return library
    .filter((tag) => !tag.isHiddenOnCard && (tag.usage.characters > 0 || activeIds.has(tag.id)))
    .toSorted((a, b) => b.usage.characters - a.usage.characters || a.name.localeCompare(b.name))
    .map((tag) => ({ id: tag.id, name: tag.name }));
}
