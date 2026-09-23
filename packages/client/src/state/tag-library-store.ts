// TAG LIBRARY UI STATE — the roster's sort MODE (Most used / A–Z / Manual order), remembered per
// device, plus the ONE transient flag that mode's neighbour needs (see `pruneConfirmOpen`). Its own store rather than a field on `character-library`: that store is the CHARACTER list's
// prefs (its own §12.1 registry rationale), and the tag roster is a different pane in a different
// workspace — folding one surface's mode into another's store would make either store's name a lie.
//
// WHY PER DEVICE, not the synced `user_settings` blob (§12.1, the question that registry row forces): this
// is a browse posture, the same class as `character-library`'s sort/view chips and `config-group-open`'s
// disclosure. "I'm scanning alphabetically right now on the laptop" is not a preference a user expects to
// follow them to another machine, and it writes on every dropdown change — traffic the synced blob should
// not carry. Registered as device-local in tooling/src/verify/gates/persistence-boundary.ts.

import type { TagSortMode } from "#lib";
import { DEFAULT_TAG_SORT_MODE, TAG_SORT_MODES } from "#lib";
import { createPersistedStore } from "./create-persisted-store.ts";

interface TagLibraryState {
  readonly sortMode: TagSortMode;
  /** The prune confirm's open state — TRANSIENT (excluded from `partialize`, so a reload never restores an
   *  open destructive dialog).
   *
   *  IT IS A STORE FIELD BECAUSE THE VERB AND ITS QUESTION LIVE IN TWO FIBERS (#1725). "Prune unused tags"
   *  is a `CollectionContribution.actions` entry now, so the HOST draws the menu item in the library's
   *  overflow kebab while the CONFIRM — which needs the live unused COUNT and the cascade copy — stays with
   *  the rows, inside `list`. The action's `useRun` returns a runner that opens the dialog the rows render;
   *  nothing else can carry a signal between two components the host mounts as siblings. The alternative
   *  would have been a fifth contract field letting a contribution render into the host's menu, which is the
   *  seam's whole point inverted (host draws the door, owner decides what walks through it). */
  readonly pruneConfirmOpen: boolean;
}

const DEFAULT_STATE: TagLibraryState = { sortMode: DEFAULT_TAG_SORT_MODE, pruneConfirmOpen: false };

const PERSIST_VERSION = 1;

function isSortMode(v: unknown): v is TagSortMode {
  return typeof v === "string" && (TAG_SORT_MODES as readonly string[]).includes(v);
}

// TOTAL migrate: an unknown/corrupt persisted shape degrades to the default rather than throwing.
function migrate(persisted: unknown): TagLibraryState {
  const stored = (persisted as { sortMode?: unknown } | null)?.sortMode;
  return { sortMode: isSortMode(stored) ? stored : DEFAULT_TAG_SORT_MODE, pruneConfirmOpen: false };
}

// The SECOND type argument is the PERSISTED shape, and it is narrower than the state on purpose: the
// `partialize` doc calls that the transient-field exclusion, and `pruneConfirmOpen` is the transient field —
// a reload must never restore an open destructive dialog.
const useTagLibraryStore = createPersistedStore<TagLibraryState, Pick<TagLibraryState, "sortMode">>("tag-library", (): TagLibraryState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): Pick<TagLibraryState, "sortMode"> => ({ sortMode: s.sortMode }),
});

/** Reactive: the tag roster's current sort mode. */
export function useTagSortMode(): TagSortMode {
  return useTagLibraryStore((s) => s.sortMode);
}

/** Pick the roster's sort mode — written by the host's control-row Select through the tag collection's
 *  `sort.useMode` (the mock design §3.2), read by the rows for the comparator. One home, two readers. */
export function setTagSortMode(sortMode: TagSortMode): void {
  useTagLibraryStore.setState({ sortMode }, false, "tag-library/setSortMode");
}

/** Reactive: whether the prune confirm is open (see {@link TagLibraryState.pruneConfirmOpen}). */
export function useTagPruneConfirmOpen(): boolean {
  return useTagLibraryStore((s) => s.pruneConfirmOpen);
}

/** Open or dismiss the prune confirm — the overflow action's runner opens it, the dialog itself closes it. */
export function setTagPruneConfirmOpen(pruneConfirmOpen: boolean): void {
  useTagLibraryStore.setState({ pruneConfirmOpen }, false, "tag-library/setPruneConfirmOpen");
}
