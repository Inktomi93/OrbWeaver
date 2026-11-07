// The Refinery sessions search store: what the sessions roster is filtering by.
//
// A store and not `useState` for the reason `preset-search-store.ts` states: the chrome band's census and the rows
// beneath it share no React parent that can hold the query, and a census that ignores the lens it sits on is not a
// census. Session-scoped and not persisted, like the other roster searches.

import { createGatedStore } from "./create-gated-store.ts";

interface RefinerySearchState {
  /** The search text (`""` = every session shows). */
  readonly query: string;
}

const useRefinerySearchStore = createGatedStore<RefinerySearchState>("refinery-search", (): RefinerySearchState => ({ query: "" }));

/** Write the search text (every keystroke, and the empty state's Clear). */
export function setRefinerySearchQuery(query: string): void {
  useRefinerySearchStore.setState({ query }, false, "refinery-search/query");
}

/** Reactive: the search text (`""` = every session). A primitive selector. */
export function useRefinerySearchQuery(): string {
  return useRefinerySearchStore((s) => s.query);
}
