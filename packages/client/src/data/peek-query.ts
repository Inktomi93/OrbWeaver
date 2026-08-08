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

/** The PREFIX form of {@link peekQueryData}: every cached entry whose key starts with `queryKeyPrefix`,
 *  newest-first is NOT guaranteed — the caller folds them.
 *
 *  It exists because a paged list is cached under its PAGE PARAMS, and a reader that only wants "is this row
 *  already known" cannot name the page: `character.list` is fetched with four different `limit`s by four
 *  callers (the picker's 100, the portrait map's 200, quick picks' 6, agent-nav's 500), each its own cache
 *  key. Pinning a reader to one of those limits is a magic-number handshake between two files that breaks
 *  silently when either moves; matching the PREFIX picks up whichever page happens to be warm and couples to
 *  nothing. Same law as the single-key peek: read-only, never fetches, `data/`-only. */
export function peekMatchingQueryData<T>(queryClient: QueryClient, queryKeyPrefix: QueryKey): readonly T[] {
  return queryClient
    .getQueriesData<T>({ queryKey: queryKeyPrefix })
    .map(([, data]) => data)
    .filter((data): data is T => data !== undefined);
}
