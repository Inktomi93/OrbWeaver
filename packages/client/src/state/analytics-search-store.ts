// The leaderboard search lives in one session-scoped createGatedStore because the shell band and surface
// rows have no common React parent. Both must read the same server-narrowed stats.leaderboard query so the
// census agrees with its rows. A rail bounce preserves the current intent; a hard reload returns to rest.

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
