// Synchronous cache reads live here (client-architecture-state-and-gates.md §12 row 2b).
// Hookless resolution, action decisions and warming may peek; reactive reads and freshness remain query-owned.
// This never fetches, creates, mutates or invalidates a cache entry.

import type { AnyDataTag, InferDataFromTag, QueryClient, QueryKey } from "@tanstack/react-query";

// A never-key specialization must not become a bottom-typed proof through method bivariance.
type CachedDataForKey<TKey extends QueryKey & AnyDataTag> = [TKey] extends [never] ? unknown : InferDataFromTag<never, TKey>;

/** Read a query's cached data cache-first (no fetch, no suspend) — `undefined` when the key isn't cached.
 *  Use for hookless resolution/action decisions or absent-cache warming checks, not reactive reads or freshness. */
export function peekQueryData<TKey extends QueryKey & AnyDataTag>(queryClient: QueryClient, queryKey: TKey): CachedDataForKey<TKey> | undefined {
  return queryClient.getQueryData<never, TKey, CachedDataForKey<TKey>>(queryKey);
}
