// A CACHE-FIRST query peek (UI-Gates-and-Lessons.md §11.3 — imperative cache access lives ONLY in `data/`).
// The read equivalent of the invalidation seam: a non-suspending, non-fetching synchronous read of whatever
// is ALREADY in the query cache for a key, or `undefined` when nothing is cached. This is the sanctioned
// channel for a rare SYNCHRONOUS cross-domain read where a hook can't run — the CONTEXT-tab contributor's
// pure `when(state)` predicate (§6c), which must decide applicability at resolve-time without a hook and
// without a round-trip (the reader relies on the owning feature having already fetched the key). It NEVER
// fetches, mutates, or invalidates — a read-only peek — so it does not recreate the invalidation sprawl the
// §11.3 gate guards against; the gate exempts `data/`, and this is the one place `getQueryData` is called
// outside `createEntityMutation`'s optimistic recipe.

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Read a query's cached data cache-first (no fetch, no suspend) — `undefined` when the key isn't cached.
 *  Use ONLY where a hook can't run (a pure resolve-time predicate); everywhere else use `useSuspenseQuery`/
 *  `useGatedQuery` inside a `QueryBoundary`. */
export function peekQueryData<T>(queryClient: QueryClient, queryKey: QueryKey): T | undefined {
  return queryClient.getQueryData<T>(queryKey);
}
