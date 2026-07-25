// The pinned QueryClient. The SSE bus drives freshness; these knobs make that model correct: staleTime
// Infinity (never 'static', which would silently ignore invalidateQueries), refetchOnReconnect true
// (the SSE-gap catch-up), refetchOnWindowFocus false (the bus owns liveness), mutations retry 0.
// Global error surfacing lives here: QueryCache/MutationCache onError read meta.errorToast.

import type { Query } from "@tanstack/react-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { notify } from "#lib";

/** Per-query/mutation meta — the sanctioned v5 carrier for global-handler config. */
export interface AppMeta {
  /** Toast this message (or derive one from the error) on failure; omit = fail silently to state. A
   *  FUNCTION form may return `null` to suppress the toast for a specific error (e.g. a stale turn abort,
   *  which the chat bus surfaces its own honest notice for — see `isSilencedTurnAbort`); a returned string
   *  still toasts. */
  readonly errorToast?: string | ((error: unknown) => string | null);
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
  const message = typeof meta.errorToast === "function" ? meta.errorToast(error) : meta.errorToast;
  // A function-form `errorToast` returns null to suppress (the bus owns the honest surface).
  if (message !== null) {
    notify.error(message);
  }
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
