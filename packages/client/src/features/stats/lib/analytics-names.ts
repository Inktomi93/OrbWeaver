// The accessible names the Insights leaderboard list prints, in one import-free module so a spec's node side can import them.

/** The leaderboard list's search box. */
export const ANALYTICS_SEARCH_NAME = "Search characters";

/** A leaderboard sort segment, named for the order it picks. */
export function analyticsSortName(sort: string): string {
  return `Sort by ${sort}`;
}
