// The character-library VIEW-PREFS store: sort mode, flat/categorized view mode, filter chips, bulk-select
// flag. Does NOT home the selected character (character-selection-store.ts) or the bulk selection set
// (createCollectionSurface's transient id-set). Device-local, registered in
// tooling/src/verify/gates/persistence-boundary.ts DEVICE_LOCAL_REGISTRY. `bulkMode` is transient (excluded
// from partialize) — a reload landing in bulk mode with an empty selection would be a confusing dead state.
// (It also used to carry `browseOffset`, the scroll position #255 rescued across the LIST pane's selection
// swap. #501 stopped the pane swapping, so nothing unmounts the list and there is no position to rescue.)

import type { CharacterListSort } from "@orb/contracts/character";
import { CHARACTER_LIST_SORTS } from "@orb/contracts/character";
import { isPlainObject } from "@orb/kit/guards";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ActiveTagFilterState, TagFilterEntry } from "#lib";
import { cycleTagFilterEntries } from "#lib";
import { createPersistedStore } from "./create-persisted-store.ts";

/** The §4.3 view axis — a single-home tuple, the union DERIVED (Spine §5.5). */
const CHARACTER_VIEW_MODES = ["flat", "categorized"] as const;
export type CharacterViewMode = (typeof CHARACTER_VIEW_MODES)[number];

interface CharacterLibraryState {
  readonly sortMode: CharacterListSort;
  readonly viewMode: CharacterViewMode;
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  /** Tag multi-select, THREE-STATE: every `include` entry must be present on a row and every `exclude`
   *  entry absent (AND-semantics on both arms). A tag with no entry is unfiltered. */
  readonly tagFilter: readonly TagFilterEntry[];
  /** Bulk-select mode. Transient (not persisted). */
  readonly bulkMode: boolean;
  /**
   * The RAW text in the pane's search field (`""` = the unsearched library). Transient (not persisted) —
   * a reload landing on the unfiltered library is right, and the `chat-list-filter-store` twin agrees.
   *
   * IT LIVES HERE RATHER THAN IN THE SURFACE BECAUSE THE BAND CANNOT SEE PROPS (#518, the #490 mechanism
   * one section over). The LIST chrome band is a sibling shell region with no shared React ancestor, and it
   * prints the library census; while the search was `useState` inside `CharacterLibrarySurface` the band
   * could only ever print the unnarrowed total, which is a number about nothing the reader can see. Stored
   * RAW, never debounced: the field is controlled off this value, and each consumer that turns it into a
   * QUERY damps it with the shared `SEARCH_DEBOUNCE_MS` — one damper, applied twice, rather than a second
   * stored copy that could disagree with the field.
   */
  readonly search: string;
  /** Blurs the editor's spoiler-bearing card text for screen-sharing. */
  readonly spoilerBlur: boolean;
  /** Is the filter rail's VOCABULARY on screen? Default `false` — the rail's inactive tag chips and its
   *  +N-more panel are a disclosure now (#491). A browse posture, so it persists like `viewMode`: a user who
   *  opened the vocabulary is filtering, and re-collapsing it under them on every remount would fight them.
   *  Only the INACTIVE half hides — the scope pills and every ACTIVE chip render in both states, so the
   *  "a filter you cannot see is a filter you cannot turn off" invariant is untouched. */
  readonly filtersOpen: boolean;
}

/** Everything but the transient `bulkMode`/`search` survives a reload. */
interface PersistedCharacterLibraryState {
  readonly sortMode: CharacterListSort;
  readonly viewMode: CharacterViewMode;
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  readonly tagFilter: readonly TagFilterEntry[];
  readonly spoilerBlur: boolean;
  readonly filtersOpen: boolean;
}

const DEFAULT_STATE: CharacterLibraryState = {
  sortMode: "recent",
  viewMode: "flat",
  favoritesOnly: false,
  showArchived: false,
  tagFilter: [],
  bulkMode: false,
  search: "",
  spoilerBlur: false,
  filtersOpen: false,
};

// v2: `tagFilter` went from a flat id list (include-only) to three-state entries. `migrate` reads BOTH
// shapes, so a persisted v1 blob keeps its selections as `include` rather than silently losing them.
const PERSIST_VERSION = 2;

function isSort(v: unknown): v is CharacterListSort {
  return typeof v === "string" && (CHARACTER_LIST_SORTS as readonly string[]).includes(v);
}
function isViewMode(v: unknown): v is CharacterViewMode {
  return typeof v === "string" && (CHARACTER_VIEW_MODES as readonly string[]).includes(v);
}
function toActiveState(v: unknown): ActiveTagFilterState | undefined {
  return v === "include" || v === "exclude" ? v : undefined;
}
/** TOTAL: accepts the v1 `string[]` (all `include`) AND the v2 entry list, dropping anything malformed. */
function toTagFilter(v: unknown): readonly TagFilterEntry[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const entries: TagFilterEntry[] = [];
  for (const raw of v) {
    if (typeof raw === "string") {
      entries.push({ id: castId<TagId>(raw), state: "include" });
      continue;
    }
    if (!isPlainObject(raw)) {
      continue;
    }
    const state = toActiveState(raw["state"]);
    const id = raw["id"];
    if (typeof id === "string" && state !== undefined) {
      entries.push({ id: castId<TagId>(id), state });
    }
  }
  return entries;
}

// TOTAL migrate: any unknown/corrupt persisted shape degrades field-by-field to the default (never throws).
function migrate(persisted: unknown, _version: number): CharacterLibraryState {
  if (!isPlainObject(persisted)) {
    return DEFAULT_STATE;
  }
  const p = persisted as Partial<Record<keyof PersistedCharacterLibraryState, unknown>>;
  return {
    sortMode: isSort(p.sortMode) ? p.sortMode : DEFAULT_STATE.sortMode,
    viewMode: isViewMode(p.viewMode) ? p.viewMode : DEFAULT_STATE.viewMode,
    favoritesOnly: typeof p.favoritesOnly === "boolean" ? p.favoritesOnly : false,
    showArchived: typeof p.showArchived === "boolean" ? p.showArchived : false,
    tagFilter: toTagFilter(p.tagFilter),
    bulkMode: false,
    search: "",
    spoilerBlur: typeof p.spoilerBlur === "boolean" ? p.spoilerBlur : false,
    // No version bump: a v1/v2 blob simply has no `filtersOpen`, and the DEFAULT (collapsed) is the value
    // #491 wants a returning user to land on anyway. `migrate` is field-by-field total, so absence degrades.
    filtersOpen: typeof p.filtersOpen === "boolean" ? p.filtersOpen : false,
  };
}

const useCharacterLibraryStore = createPersistedStore<CharacterLibraryState, PersistedCharacterLibraryState>(
  "character-library",
  (): CharacterLibraryState => DEFAULT_STATE,
  {
    version: PERSIST_VERSION,
    migrate,
    partialize: (s): PersistedCharacterLibraryState => ({
      sortMode: s.sortMode,
      viewMode: s.viewMode,
      favoritesOnly: s.favoritesOnly,
      showArchived: s.showArchived,
      tagFilter: s.tagFilter,
      spoilerBlur: s.spoilerBlur,
      filtersOpen: s.filtersOpen,
    }),
  },
);

export function setCharacterSortMode(sortMode: CharacterListSort): void {
  useCharacterLibraryStore.setState({ sortMode }, false, "character-library/setSort");
}
export function setCharacterViewMode(viewMode: CharacterViewMode): void {
  useCharacterLibraryStore.setState({ viewMode }, false, "character-library/setViewMode");
}
export function toggleFavoritesOnly(): void {
  useCharacterLibraryStore.setState((s) => ({ favoritesOnly: !s.favoritesOnly }), false, "character-library/toggleFavoritesOnly");
}
export function toggleShowArchived(): void {
  useCharacterLibraryStore.setState((s) => ({ showArchived: !s.showArchived }), false, "character-library/toggleShowArchived");
}
/** Advance ONE tag chip one step around the off → include → exclude → off cycle (the cycle order itself
 *  lives in `#lib`'s `NEXT_TAG_FILTER_STATE`, the axis's one home). */
export function cycleTagFilter(tagId: TagId): void {
  useCharacterLibraryStore.setState((s) => ({ tagFilter: cycleTagFilterEntries(s.tagFilter, tagId) }), false, "character-library/cycleTagFilter");
}
/** Drop every NARROWING chip in one act — the way out of a filtered-empty library (the empty state's own
 *  next action, UI-Arch §4.3 rule 1). `showArchived` is deliberately untouched: its OFF state is the resting
 *  library, not a narrowing the user has to be rescued from. */
export function clearCharacterFilters(): void {
  useCharacterLibraryStore.setState({ favoritesOnly: false, tagFilter: [] }, false, "character-library/clearFilters");
}
export function __resetTagFilter(): void {
  useCharacterLibraryStore.setState({ tagFilter: [] }, false, "character-library/__resetTagFilter");
}
/** The pane's search text (raw — a query consumer damps it itself; see the state field's note). */
export function setCharacterSearch(search: string): void {
  useCharacterLibraryStore.setState({ search }, false, "character-library/setSearch");
}
export function setBulkMode(bulkMode: boolean): void {
  useCharacterLibraryStore.setState({ bulkMode }, false, "character-library/setBulkMode");
}
export function toggleFiltersOpen(): void {
  useCharacterLibraryStore.setState((s) => ({ filtersOpen: !s.filtersOpen }), false, "character-library/toggleFiltersOpen");
}
export function toggleSpoilerBlur(): void {
  useCharacterLibraryStore.setState((s) => ({ spoilerBlur: !s.spoilerBlur }), false, "character-library/toggleSpoilerBlur");
}

export function useCharacterSortMode(): CharacterListSort {
  return useCharacterLibraryStore((s) => s.sortMode);
}
export function useCharacterViewMode(): CharacterViewMode {
  return useCharacterLibraryStore((s) => s.viewMode);
}
export function useFavoritesOnly(): boolean {
  return useCharacterLibraryStore((s) => s.favoritesOnly);
}
export function useShowArchived(): boolean {
  return useCharacterLibraryStore((s) => s.showArchived);
}
export function useTagFilter(): readonly TagFilterEntry[] {
  return useCharacterLibraryStore((s) => s.tagFilter);
}
/** Reactive: the RAW search text (`""` = unsearched). Read by the pane's field AND by the LIST band's
 *  census, which is the whole reason it is store state (#518). */
export function useCharacterSearch(): string {
  return useCharacterLibraryStore((s) => s.search);
}
export function useCharacterBulkMode(): boolean {
  return useCharacterLibraryStore((s) => s.bulkMode);
}
export function useFiltersOpen(): boolean {
  return useCharacterLibraryStore((s) => s.filtersOpen);
}
export function useSpoilerBlur(): boolean {
  return useCharacterLibraryStore((s) => s.spoilerBlur);
}
