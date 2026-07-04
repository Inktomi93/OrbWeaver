// The pinned `QueryClient` (UI-Arch §6.1 — born-compliant defaults from the full-docs mine,
// UI-Lib-TanStack-Query.md §C). The SSE bus drives freshness; these knobs make that model correct:
//   • `staleTime: Infinity` — NEVER `'static'`: 'static' silently ignores `invalidateQueries()` and
//     would neuter the entire bus→cache seam (gate `no-static-staletime-on-bus-keys`).
//   • `refetchOnReconnect: true` — the SSE-gap catch-up. While offline the stream is dead and bus
//     events are missed; reconnect refetch is what closes the gap. Turning this OFF is the bug.
//   • `refetchOnWindowFocus: false` — the bus owns liveness; focus refetch is redundant churn.
//   • mutations `retry: 0` — never auto-retry a write (idempotency risk).
// Global error surfacing lives HERE (v5 removed per-query onError): QueryCache/MutationCache
// `onError` read `meta.errorToast` and route through the `notify` seam. Per-mutation inline errors
// stay on the mutation's own sticky slot (`createEntityMutation`) — the two channels coexist.

import type { Query } from "@tanstack/react-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { notify } from "#lib";

/** Per-query/mutation meta — the sanctioned v5 carrier for global-handler config. */
export interface AppMeta {
  /** Toast this message (or derive one from the error) on failure; omit = fail silently to state. */
  readonly errorToast?: string | ((error: unknown) => string);
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}

const GC_TIME_MS = 300_000; // 5 minutes
const QUERY_RETRIES = 2;

function toastFromMeta(meta: AppMeta | undefined, error: unknown): void {
  if (meta?.errorToast === undefined) {
    return;
  }
  notify.error(typeof meta.errorToast === "function" ? meta.errorToast(error) : meta.errorToast);
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Number.POSITIVE_INFINITY, // Infinity, NOT 'static' — see header
        gcTime: GC_TIME_MS,
        retry: QUERY_RETRIES,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true, // the SSE-gap closer — do not flip
        refetchOnMount: true,
        networkMode: "online",
        structuralSharing: true, // stable refs — plays well with the React Compiler
        throwOnError: false, // <QueryBoundary> opts into throwing per-tree via useSuspenseQuery
      },
      mutations: {
        retry: 0,
        networkMode: "online",
      },
    },
    queryCache: new QueryCache({
      onError: (error, query: Query<unknown, unknown, unknown>): void => {
        toastFromMeta(query.meta, error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation): void => {
        toastFromMeta(mutation.meta, error);
      },
    }),
  });
}
