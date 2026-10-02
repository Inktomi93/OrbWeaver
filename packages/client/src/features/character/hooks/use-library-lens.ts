// The library lens defers at the reader, not the external-store writer. clearCharacterFilters is already
// one batched setState; clearing it re-keys the collection and an urgent useSyncExternalStore update can
// put the restored list inside the click task. Chips repaint immediately while the list follows in an
// interruptible pass.
//
// Deferred values are joined strings, never freshly built arrays: useDeferredValue compares with
// Object.is, so a new array on every render never settles.

import type { TagId } from "@orb/kit/ids";
import { useDeferredValue } from "react";
import type { TagFilterEntry } from "#lib";
import { tagIdsInState } from "../lib/character-library-lens.ts";

/** The lens the `character.list` read is keyed on, one render BEHIND the chips. */
export interface LibraryLens {
  readonly favoritesOnly: boolean;
  readonly includeTagIds: readonly TagId[];
  readonly excludeTagIds: readonly TagId[];
  /** Any chip NARROWING the settled read — what the empty state has standing to blame. It follows the
   *  deferred lens, never the live one: blaming a chip the user has already cleared is the same class of
   *  lie as blaming the search box for a filter's empty. `showArchived` is deliberately not one (its ON
   *  state WIDENS the set). */
  readonly filtersActive: boolean;
}

/** `""` is the empty list — `"".split(",")` yields `[""]`, i.e. a filter for a tag whose id is empty. */
function splitTagKey(key: string): readonly TagId[] {
  return key === "" ? [] : (key.split(",") as TagId[]);
}

/** Defers the chip lens by one render so the list's re-render leaves the click's frame. */
export function useLibraryLens(favoritesOnly: boolean, effectiveFilter: readonly TagFilterEntry[]): LibraryLens {
  const settledFavorites = useDeferredValue(favoritesOnly);
  const includeTagIds = splitTagKey(useDeferredValue(tagIdsInState(effectiveFilter, "include").join(",")));
  const excludeTagIds = splitTagKey(useDeferredValue(tagIdsInState(effectiveFilter, "exclude").join(",")));
  return {
    favoritesOnly: settledFavorites,
    includeTagIds,
    excludeTagIds,
    filtersActive: settledFavorites || includeTagIds.length > 0 || excludeTagIds.length > 0,
  };
}
