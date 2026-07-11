// React-query wraps over the two bootstrap fetchers (`lib/auth-bootstrap.ts`) — how COMPONENTS read the
// auth state (the login dispatcher, the account surface). The route guards call the fetchers directly;
// these hooks exist so N mounted readers share one cache entry. Non-tRPC reads, so the keys are the
// module consts (the sanctioned identifier mint — `no-array-literal-querykey`'s documented seam).

import type { UseQueryResult } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { AuthConfig, AuthMe } from "../lib/auth-bootstrap";
import { AUTH_CONFIG_KEY, AUTH_ME_KEY, fetchAuthConfig, fetchAuthMe } from "../lib/auth-bootstrap";

const authConfigOptions = queryOptions({
  queryKey: AUTH_CONFIG_KEY,
  queryFn: fetchAuthConfig,
  staleTime: Number.POSITIVE_INFINITY,
});

const authMeOptions = queryOptions({ queryKey: AUTH_ME_KEY, queryFn: fetchAuthMe });

/** The deployment auth config — immutable for the session (boot-env mode), so it never refetches; the
 *  fetcher's own memo additionally dedupes across cache evictions. */
export function useAuthConfig(): UseQueryResult<AuthConfig> {
  return useQuery(authConfigOptions);
}

/** THIS session's auth state. The app QueryClient's `staleTime: Infinity` default applies — freshness is
 *  event-driven: login navigates (a fresh guard fetch), logout hard-redirects (a full document reset), so
 *  a mounted reader never needs a poll. */
export function useAuthMe(): UseQueryResult<AuthMe> {
  return useQuery(authMeOptions);
}
