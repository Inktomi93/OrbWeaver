// The character-library VIEW-PREFS store: sort mode, flat/categorized view mode, filter chips, bulk-select
// flag. Does NOT home the selected character (character-selection-store.ts) or the bulk selection set
// (createCollectionSurface's transient id-set). Device-local, registered in
// scripts/check/gates/persistence-boundary.ts DEVICE_LOCAL_REGISTRY. `bulkMode` is transient (excluded
// from partialize) — a reload landing in bulk mode with an empty selection would be a confusing dead state.

import type { CharacterListSort } from "@orb/contracts/character";
import { CHARACTER_LIST_SORTS } from "@orb/contracts/character";
import { isPlainObject } from "@orb/kit/guards";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ActiveTagFilterState, TagFilterEntry } from "#lib";
import { cycleTagFilterEntries } from "#lib";
import { createPersistedStore } from "./create-persisted-store.ts";

/** The §4.3 view axis — a single-home tuple, the union DERIVED (Spine §5.5). */
export const CHARACTER_VIEW_MODES = ["flat", "categorized"] as const;
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
  /** Blurs the editor's spoiler-bearing card text for screen-sharing. */
  readonly spoilerBlur: boolean;
}

/** Everything but the transient `bulkMode` survives a reload. */
interface PersistedCharacterLibraryState {
  readonly sortMode: CharacterListSort;
  readonly viewMode: CharacterViewMode;
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  readonly tagFilter: readonly TagFilterEntry[];
  readonly spoilerBlur: boolean;
}

const DEFAULT_STATE: CharacterLibraryState = {
  sortMode: "recent",
  viewMode: "flat",
  favoritesOnly: false,
  showArchived: false,
  tagFilter: [],
  bulkMode: false,
  spoilerBlur: false,
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
    spoilerBlur: typeof p.spoilerBlur === "boolean" ? p.spoilerBlur : false,
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
export function setBulkMode(bulkMode: boolean): void {
  useCharacterLibraryStore.setState({ bulkMode }, false, "character-library/setBulkMode");
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
export function useCharacterBulkMode(): boolean {
  return useCharacterLibraryStore((s) => s.bulkMode);
}
export function useSpoilerBlur(): boolean {
  return useCharacterLibraryStore((s) => s.spoilerBlur);
}
