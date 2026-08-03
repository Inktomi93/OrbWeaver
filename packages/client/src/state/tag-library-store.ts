// TAG LIBRARY BROWSE PREFS — the roster's sort MODE (Most used / A–Z / Manual order), remembered per
// device. Its own store rather than a field on `character-library`: that store is the CHARACTER list's
// prefs (its own §12.1 registry rationale), and the tag roster is a different pane in a different
// workspace — folding one surface's mode into another's store would make either store's name a lie.
//
// WHY PER DEVICE, not the synced `user_settings` blob (§12.1, the question that registry row forces): this
// is a browse posture, the same class as `character-library`'s sort/view chips and `config-group-open`'s
// disclosure. "I'm scanning alphabetically right now on the laptop" is not a preference a user expects to
// follow them to another machine, and it writes on every dropdown change — traffic the synced blob should
// not carry. Registered as device-local in scripts/check/gates/persistence-boundary.ts.

import type { TagSortMode } from "#lib";
import { DEFAULT_TAG_SORT_MODE, TAG_SORT_MODES } from "#lib";
import { createPersistedStore } from "./create-persisted-store.ts";

interface TagLibraryState {
  readonly sortMode: TagSortMode;
}

const DEFAULT_STATE: TagLibraryState = { sortMode: DEFAULT_TAG_SORT_MODE };

const PERSIST_VERSION = 1;

function isSortMode(v: unknown): v is TagSortMode {
  return typeof v === "string" && (TAG_SORT_MODES as readonly string[]).includes(v);
}

// TOTAL migrate: an unknown/corrupt persisted shape degrades to the default rather than throwing.
function migrate(persisted: unknown): TagLibraryState {
  const stored = (persisted as { sortMode?: unknown } | null)?.sortMode;
  return { sortMode: isSortMode(stored) ? stored : DEFAULT_TAG_SORT_MODE };
}

const useTagLibraryStore = createPersistedStore<TagLibraryState>("tag-library", (): TagLibraryState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): TagLibraryState => ({ sortMode: s.sortMode }),
});

/** Reactive: the tag roster's current sort mode. */
export function useTagSortMode(): TagSortMode {
  return useTagLibraryStore((s) => s.sortMode);
}

/** Pick the roster's sort mode (the roster's own Select). */
export function setTagSortMode(sortMode: TagSortMode): void {
  useTagLibraryStore.setState({ sortMode }, false, "tag-library/setSortMode");
}
