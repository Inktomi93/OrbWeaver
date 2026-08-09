// The card-refinery READ tier (R2) — the three query procs of the R1 router, every one of them
// session-scoped: the owner's roster, ONE session's full view, and ONE session's append-only run ledger.
//
// EACH HOOK RETURNS THE `UseQueryResult` WHOLE, deliberately. The R3 surface (board C15) owns its own
// pending/error rendering — a hook that unwrapped `.data` here would force every consumer to invent a
// freshness/failure story of its own, which is the `QueryBoundary`/`QueryInlineStates` seam's job. Nothing is
// pre-selected and nothing is defaulted: an unlanded read is `undefined`, and a session that vanished under
// the reader is the verb's leak-free NOT_FOUND, surfaced as the query's error rather than an empty shape.
//
// THE `TError` HALF IS `TrpcReadError`, NEVER `UseQueryResult`'s DEFAULT. That default is `Error`, which the
// real client result does not satisfy: a tRPC error is `TRPCClientErrorLike`, an INTERFACE with no `name`
// (measured here — `UseQueryResult<SessionRoster>` is tsc TS2322; the same measurement
// `features/preset/lib/resolve-failure.ts` records for its `ReadFailure` prop). The alias is derived off
// `AppRouter` in `data/trpc.ts` precisely so a feature hook can satisfy `useExplicitReturnType` without
// re-spelling the router's error shape here (§5.4 — one home, derive, never re-spell).
//
// THE DETAIL READS ARE GATED, NOT FAKE-DISABLED (`no-fake-disabled-id`): with no session selected the key is
// never built and nothing hits the server (`useGatedQuery` → `skipToken`), instead of a request for an empty-
// string id that the server would answer NOT_FOUND. `refetch()` does not work on a skipped query — a caller
// that needs an imperative refetch keeps a session selected, which is the only state where a refetch means
// anything here.
//
// FRESHNESS: there is no refinery bus event of any kind, so these three keys are driven ENTIRELY by the
// write tier's `invalidates` rows (`use-refinery-mutations.ts`) — the writer-local class, cited per key in
// `scripts/check/gates/query-freshness-coverage.ts`. The app QueryClient runs `staleTime: Infinity`, so a
// read with no such row would be frozen at its first fetch; every write verb that can move one names it.

import type { RefinerySessionId } from "@orb/kit/ids";
import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc, TrpcReadError } from "#data";
import { useGatedQuery, useTRPC } from "#data";

type SessionRoster = inferOutput<Trpc["refinery"]["listSessions"]>;
type SessionView = inferOutput<Trpc["refinery"]["getSession"]>;
type RunLedger = inferOutput<Trpc["refinery"]["listRuns"]>;

/** The R2 read tier for the R3 refinery SURFACE — the owner's sessions, newest-updated first, with the
 *  roster's `latestVerdict` badge. */
export function useRefinerySessions(): UseQueryResult<SessionRoster, TrpcReadError> {
  const trpc = useTRPC();
  return useQuery(trpc.refinery.listSessions.queryOptions());
}

/** The R2 read tier — ONE session's full view (the anti-drift `originalCard` anchor, selection, stageConfig,
 *  guidance, iterationCount). `null` selects nothing and asks nothing. Consumed by the R3 surface. */
export function useRefinerySession(sessionId: RefinerySessionId | null): UseQueryResult<SessionView, TrpcReadError> {
  const trpc = useTRPC();
  return useGatedQuery(sessionId, (id) => trpc.refinery.getSession.queryOptions({ sessionId: id }));
}

/** The R2 read tier — ONE session's append-only run ledger, oldest first (the D62 CONTEXT Runs tab).
 *  `null` selects nothing and asks nothing. Consumed by the R3 surface. */
export function useRefineryRuns(sessionId: RefinerySessionId | null): UseQueryResult<RunLedger, TrpcReadError> {
  const trpc = useTRPC();
  return useGatedQuery(sessionId, (id) => trpc.refinery.listRuns.queryOptions({ sessionId: id }));
}
