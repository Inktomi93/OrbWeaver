// Synchronous cache reads live here (client-architecture-state-and-gates.md §12 row 2b).
// Hookless resolution, action decisions and warming may peek; reactive reads and freshness remain query-owned.
// This never fetches, creates, mutates or invalidates a cache entry.

import type { AnyDataTag, InferDataFromTag, QueryClient, QueryKey } from "@tanstack/react-query";

/** Read a query's cached data cache-first (no fetch, no suspend) — `undefined` when the key isn't cached.
 *  Use for hookless resolution/action decisions or absent-cache warming checks, not reactive reads or freshness. */
export function peekQueryData<TKey extends QueryKey & AnyDataTag>(queryClient: QueryClient, queryKey: TKey): InferDataFromTag<never, TKey> | undefined;
export function peekQueryData<T>(queryClient: QueryClient, queryKey: QueryKey): T | undefined;
export function peekQueryData<T>(queryClient: QueryClient, queryKey: QueryKey): T | undefined {
  return queryClient.getQueryData<T>(queryKey);
}

// THE PREFIX FORM (`peekMatchingQueryData`) WAS DELETED 2026-08-14 with its one consumer. It folded every
// warm `character.list` page so a pre-send room could name its founding characters before `character.get`
// landed (`useDraftCastCards`) — a first-frame problem that no longer exists: a chat row exists from the creation
// click and `useStartChat` seeds `chat.getChat` from `startChat`'s own response, so the room's first frame is
// already warm off the read it actually uses. Git history holds it if a genuine second prefix reader appears.
