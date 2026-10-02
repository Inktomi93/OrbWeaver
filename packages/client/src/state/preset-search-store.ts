// The Presets LIST search store: what the preset library pane is filtering by.
//
// WHY IT IS A STORE AND NOT `useState` (side-eye 2026-08-19 P2 — the header count). The pane's chrome BAND
// ("PRESETS · 6" + New/Import) is rendered by the shell, from the section definition's `useListHeader` slot, and
// the ROWS are rendered by the surface below it — two components with no common React parent that can hold
// the query. So the band counted `preset.list` while the surface counted the FILTER, and a search with no
// hits printed "PRESETS 6" beside "No matches". A census that ignores the lens it sits on is not a census.
// (The corpus omnibox is the landed precedent for this exact split — `corpus-search-store.ts`.)
//
// SESSION-SCOPED, NOT PERSISTED — `createGatedStore`, like `corpus-search-store`/`chat-list-filter-store`.
// A rail bounce restores the search; a hard RELOAD lands on the rest state. A query is a moment's intent, and
// rehydrating yesterday's words into a box that then hides most of the library is a question asked in the
// user's name.

import { createGatedStore } from "./create-gated-store.ts";

interface PresetSearchState {
  /** The search text (`""` = the rest state — every row shows). */
  readonly query: string;
}

const usePresetSearchStore = createGatedStore<PresetSearchState>("preset-search", (): PresetSearchState => ({ query: "" }));

/** Write the search text (every keystroke, and the empty state's Clear). */
export function setPresetSearchQuery(query: string): void {
  usePresetSearchStore.setState({ query }, false, "preset-search/query");
}

/** Reactive: the search text (`""` = the rest state). A single-field primitive selector. */
export function usePresetSearchQuery(): string {
  return usePresetSearchStore((s) => s.query);
}
