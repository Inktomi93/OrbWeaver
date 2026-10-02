// The Analytics LIST search store: what the leaderboard pane is filtering by.
//
// WHY IT IS A STORE AND NOT `useState` (the preset-search precedent). The pane's chrome BAND ("Analytics
// 50 of 328") is rendered by the shell from the section definition's `useListHeader` slot, and the ROWS are
// rendered by the surface below it — two components with no common React parent that can hold the query.
// So the band would count the whole population while the surface counts the FILTERED page, and a search
// with three hits would print "50 of 328" beside three rows. Both read this ONE store, and the search rides
// into `stats.leaderboard`'s query key, so the band's census and the surface's rows answer off the same
// server-narrowed page — the honest "N of M matches".
//
// SESSION-SCOPED, NOT PERSISTED — `createGatedStore`, like `preset-search-store`/`corpus-search-store`. A
// rail bounce restores the search; a hard RELOAD lands on the rest state (a query is a moment's intent).

import { createGatedStore } from "./create-gated-store.ts";

interface AnalyticsSearchState {
  /** The search text (`""` = the rest state — the full ranked page shows). */
  readonly query: string;
}

const useAnalyticsSearchStore = createGatedStore<AnalyticsSearchState>("analytics-search", (): AnalyticsSearchState => ({ query: "" }));

/** Write the search text (every keystroke, and the empty state's Clear). */
export function setAnalyticsSearchQuery(query: string): void {
  useAnalyticsSearchStore.setState({ query }, false, "analytics-search/query");
}

/** Reactive: the search text (`""` = the rest state). A single-field primitive selector. */
export function useAnalyticsSearchQuery(): string {
  return useAnalyticsSearchStore((s) => s.query);
}
