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
import { createPersistedStore } from "./create-persisted-store";

/** The §4.3 view axis — a single-home tuple, the union DERIVED (Spine §5.5). */
export const CHARACTER_VIEW_MODES = ["flat", "categorized"] as const;
export type CharacterViewMode = (typeof CHARACTER_VIEW_MODES)[number];

interface CharacterLibraryState {
  readonly sortMode: CharacterListSort;
  readonly viewMode: CharacterViewMode;
  readonly favoritesOnly: boolean;
  readonly showArchived: boolean;
  /** Tag multi-select (AND-semantics) — a row must carry EVERY id here to pass. */
  readonly tagFilter: readonly TagId[];
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
  readonly tagFilter: readonly TagId[];
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

const PERSIST_VERSION = 1;

function isSort(v: unknown): v is CharacterListSort {
  return typeof v === "string" && (CHARACTER_LIST_SORTS as readonly string[]).includes(v);
}
function isViewMode(v: unknown): v is CharacterViewMode {
  return typeof v === "string" && (CHARACTER_VIEW_MODES as readonly string[]).includes(v);
}
function toTagFilter(v: unknown): readonly TagId[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => castId<TagId>(x)) : [];
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
export function toggleTagFilter(tagId: TagId): void {
  useCharacterLibraryStore.setState(
    (s) => ({
      tagFilter: s.tagFilter.includes(tagId) ? s.tagFilter.filter((id) => id !== tagId) : [...s.tagFilter, tagId],
    }),
    false,
    "character-library/toggleTagFilter",
  );
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
export function useTagFilter(): readonly TagId[] {
  return useCharacterLibraryStore((s) => s.tagFilter);
}
export function useCharacterBulkMode(): boolean {
  return useCharacterLibraryStore((s) => s.bulkMode);
}
export function useSpoilerBlur(): boolean {
  return useCharacterLibraryStore((s) => s.spoilerBlur);
}
