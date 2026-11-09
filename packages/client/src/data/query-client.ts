// The pinned QueryClient. The SSE bus drives freshness; these knobs make that model correct: staleTime
// Infinity (never 'static', which would silently ignore invalidateQueries), refetchOnReconnect true
// (the SSE-gap catch-up), refetchOnWindowFocus false (the bus owns liveness), mutations retry 0.
// Global error surfacing lives here: QueryCache/MutationCache onError read meta.errorToast or meta.backgroundJob, and every
// settled error also passes the stale-session belt (#23b) — a mid-session UNAUTHORIZED re-auths instead of
// silently rendering the per-user empty.

import type { Query } from "@tanstack/react-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { BackgroundJob } from "#lib";
import { BACKGROUND_JOB_LOGS, notify, trpcErrorCode } from "#lib";
import { recoverIfStaleSession } from "./stale-session.ts";

// Per-query/mutation meta — the sanctioned v5 carrier for global-handler config.
interface AppMeta {
  /** Toast this message (or derive one from the error) on failure; omit = fail silently to state. A
   *  FUNCTION form may return `null` to suppress the toast for a specific error (e.g. a stale turn abort,
   *  which the chat bus surfaces its own honest notice for — see `isSilencedTurnAbort`); a returned string
   *  still toasts. */
  readonly errorToast?: string | ((error: unknown) => string | null);
  /** The consumer that states this failure inline is still mounted, so its line says it and the toast is skipped
   *  (client-architecture-state-and-gates.md §11). */
  readonly shownInline?: () => boolean;
  /** A background job's failure: its line is logged with `console.error` and never toasted
   *  (client-architecture-state-and-gates.md §11). The dev console-error ring keeps the text; the bug-report ring records
   *  only the job name. */
  readonly backgroundJob?: BackgroundJob;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}

const GC_TIME_MS = 300_000; // 5 minutes
const QUERY_RETRIES = 2;

/** The default query retry: repeating refused input cannot recover, and other failures keep the shared schedule. A read that adds
 *  its own refusal composes with it rather than restating the count. */
export function retryUnlessBadRequest(failureCount: number, error: unknown): boolean {
  return trpcErrorCode(error) !== "BAD_REQUEST" && failureCount < QUERY_RETRIES;
}

function toastFromMeta(meta: AppMeta | undefined, error: unknown): void {
  if (meta?.backgroundJob !== undefined) {
    console.error(BACKGROUND_JOB_LOGS[meta.backgroundJob], error);
    return;
  }
  if (meta?.errorToast === undefined || meta.shownInline?.() === true) {
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
        retry: retryUnlessBadRequest,
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
        recoverIfStaleSession(error);
        toastFromMeta(query.meta, error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation): void => {
        recoverIfStaleSession(error);
        toastFromMeta(mutation.meta, error);
      },
    }),
  });
}
