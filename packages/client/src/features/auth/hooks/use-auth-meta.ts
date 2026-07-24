// React-query wrap over the session fetcher (`#data/auth-bootstrap`) — how COMPONENTS read the auth
// state (the login dispatcher, the account surface). The route guards call the fetcher directly; this
// hook exists so N mounted readers share one cache entry. Non-tRPC read, so the key is the module const
// (the sanctioned identifier mint — `no-array-literal-querykey`'s documented seam). `useAuthConfig` moved
// to `#data` (a chat context tab needs `multiHumanCapable` without a cross-feature reach into auth) —
// this feature's surfaces import it from `#data` directly now.

import type { UseQueryResult } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { AuthMe } from "#data";
import { AUTH_ME_KEY, fetchAuthMe } from "#data";

const authMeOptions = queryOptions({ queryKey: AUTH_ME_KEY, queryFn: fetchAuthMe });

/** THIS session's auth state. The app QueryClient's `staleTime: Infinity` default applies — freshness is
 *  event-driven: login navigates (a fresh guard fetch), logout hard-redirects (a full document reset), so
 *  a mounted reader never needs a poll. */
export function useAuthMe(): UseQueryResult<AuthMe> {
  return useQuery(authMeOptions);
}
