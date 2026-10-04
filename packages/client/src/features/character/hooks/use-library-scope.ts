// THE LIBRARY'S SCOPE — the ONE resolution of "what is the character list currently a window into",
// shared by the two regions that ask it (#518).
//
// It exists because the LIST chrome band and the LIST pane are sibling SHELL REGIONS with no common React
// ancestor: the band prints the census, the pane fetches the rows, and each used to resolve the lens for
// itself (the band could not — the search was `useState` inside the pane, so the band printed the library
// total over a filtered list, the #490 defect one section over). Moving the search into the store made the
// axes reachable; re-spelling the resolution in the band would have made the band's scope free to drift
// from the pane's — a census over a DIFFERENT scope than the rows is the same lie in slower motion.
//
// So the narrowing arguments are built exactly ONCE, here, and both consumers spread the same object into
// `character.list`. Everything about how a lens becomes query input — the debounce, the tri-state
// `archived` spelling, the referential drop of a dead tag id, the deferred chip lens — lives at this one
// seam, and the two regions cannot disagree about the answer.

import type { TagId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { useDebouncedValue } from "#lib";
import { useCharacterSearch, useFavoritesOnly, useFiltersOpen, useShowArchived, useTagFilter } from "#state";
import type { LibraryChipTag } from "../lib/character-library-lens.ts";
import { CHARACTER_SEARCH_DEBOUNCE_MS, effectiveTagFilter, knownTagIds, tagVocabulary } from "../lib/character-library-lens.ts";
import { useLibraryLens } from "./use-library-lens.ts";

/** The NARROWING half of `character.list`'s input — spread into the pane's paged read and into the band's
 *  `{limit:1}` census, so the number and the rows are answers about the same scope. Every member is
 *  optional-by-absence (`exactOptionalPropertyTypes`): an omitted axis is UNFILTERED, never a predicate
 *  that matches everything. */
export interface LibraryScopeArgs {
  readonly search?: string;
  readonly starred?: boolean;
  readonly archived?: boolean;
  /** MUTABLE arrays behind readonly properties: this object is spread straight into `character.list`'s
   *  zod-inferred input, which takes `TagId[]`, and a `readonly TagId[]` is not assignable to it. */
  readonly includeTagIds?: TagId[];
  readonly excludeTagIds?: TagId[];
}

export interface LibraryScope {
  /** The narrowing arguments, ready to spread into `character.list`. */
  readonly args: LibraryScopeArgs;
  /** Is anything NARROWING the library? `showArchived` is deliberately not an axis here — its ON state
   *  WIDENS the set (archived rows shown beside the rest), so counting it would make the band print
   *  `N of TOTAL` over a library nothing is filtering. */
  readonly narrowed: boolean;
  /** The chip half only — what a filtered-empty state has standing to blame (`useLibraryLens`). */
  readonly filtersActive: boolean;
  /** The chip vocabulary (the owner's tag library, ranked most-used-first). */
  readonly availableTags: readonly LibraryChipTag[];
  /** The tag-library read is still in flight — the rail reserves the lines the vocabulary will land as. */
  readonly vocabularyPending: boolean;
  /** The vocabulary read SUCCEEDED and came back empty — the only state that proves the library has no tags. */
  readonly vocabularyEmpty: boolean;
}

/** Resolve the library's current scope. Safe to call from BOTH regions in one screen: every read inside is
 *  a store subscription or a react-query cache read on a key the other consumer already holds, so the
 *  second caller adds subscriptions, never requests. */
export function useLibraryScope(): LibraryScope {
  const trpc = useTRPC();
  const favoritesOnly = useFavoritesOnly();
  const showArchived = useShowArchived();
  const tagFilter = useTagFilter();
  const filtersOpen = useFiltersOpen();
  const search = useDebouncedValue(useCharacterSearch().trim(), CHARACTER_SEARCH_DEBOUNCE_MS);
  // …AND IT WAITS FOR A REASON TO EXIST (#502): 551 rows used to land on the section's cold ENTRY to paint
  // chips that are behind a closed disclosure on first visit. There are exactly two reasons to read it —
  // the disclosure is OPEN (the chips are on screen), or a PERSISTED tag filter exists, because then this
  // answer is the referential AUTHORITY that keeps a dead tag id from vetoing the whole library invisibly.
  const vocabularyNeeded = filtersOpen || tagFilter.length > 0;
  const tagLibraryQuery = useQuery({ ...trpc.tag.listTagFilterVocabulary.queryOptions(), enabled: vocabularyNeeded });
  const tagLibrary = tagLibraryQuery.data ?? [];
  // A persisted entry whose tag the library does not know can never match a row, and the server's tag
  // predicate is AND on both arms, so leaving it on the wire vetoes the ENTIRE library with nothing on
  // screen explaining it (the owner's import repro). The authority is the SETTLED read: pending (and
  // errored) is `null` = "not answered", which is NOT "knows nothing" — trusting the blob until the answer
  // lands is what keeps a LIVE filter from flashing off on every boot.
  const effectiveFilter = effectiveTagFilter(tagFilter, tagLibraryQuery.isSuccess ? knownTagIds(tagLibrary) : null);
  // The chip lens reaches the read one render behind the chips — the whole WHY is in `use-library-lens.ts`.
  const lens = useLibraryLens(favoritesOnly, effectiveFilter);
  return {
    args: {
      ...(search === "" ? {} : { search }),
      ...(lens.favoritesOnly ? { starred: true } : {}),
      // Tri-state on the wire: the toggle's ON state is the UNFILTERED library (archived rows shown BESIDE
      // the rest), so it sends nothing at all.
      ...(showArchived ? {} : { archived: false }),
      ...(lens.includeTagIds.length === 0 ? {} : { includeTagIds: [...lens.includeTagIds] }),
      ...(lens.excludeTagIds.length === 0 ? {} : { excludeTagIds: [...lens.excludeTagIds] }),
    },
    narrowed: search !== "" || lens.filtersActive,
    filtersActive: lens.filtersActive,
    availableTags: tagVocabulary(tagLibrary, tagFilter),
    vocabularyPending: tagLibraryQuery.isPending,
    vocabularyEmpty: tagLibraryQuery.isSuccess && tagLibrary.length === 0,
  };
}
