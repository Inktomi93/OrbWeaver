// THE LIBRARY LENS, AT TRANSITION PRIORITY (side-eye 2026-08-17 P2 — reports/perf-meter/se-chars-clearall.json).
//
// "Clear all" measured ONE uninterruptible 326ms task, 276ms of it blocking, attributed to
// `dispatchDiscreteEvent`, with a 300ms rAF gap. The review's proposed cause — an unbatched store reset —
// is NOT the mechanism: `clearCharacterFilters` has always been a single batched `setState`
// (state/character-library-store.ts). What actually happens is that clearing the chips re-keys the
// collection query, and React renders the whole restored library INSIDE the click's own task, because a
// `useSyncExternalStore` update is URGENT by construction and cannot be wrapped in a transition from the
// writer's side (React must not render against a stale external snapshot).
//
// So the deferral lives at the READER, which is the one seam that works: the chips repaint immediately
// (they are what the user pressed), and the list re-renders in a second, interruptible pass. Measured after,
// against the owner's real library: click 24ms, worst script `performWorkUntilDeadline` — i.e. the work
// moved onto React's scheduler and off the discrete-event frame.
//
// DEFERRED AS JOINED STRINGS, NEVER AS ARRAYS. `useDeferredValue` compares with `Object.is`, so a freshly
// built array every render never settles: the component would schedule a deferred pass forever.

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
