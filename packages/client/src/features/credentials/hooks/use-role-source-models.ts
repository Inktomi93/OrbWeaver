// The per-row facade read. One connection.getModelsForSource query per configured (source, role) pair —
// shared by the model cell and the status dot; react-query dedupes two rows on the same pair. A generous
// staleTime rides the snapshot's server-side TTL cache.
//
// The query is skipped (skipToken) for an unset source ("") since there's no per-source list to fetch.

import type { RoutingRoleKey } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useTRPC } from "#data";

type SourceModelsResult = inferOutput<Trpc["connection"]["getModelsForSource"]>;

const FACADE_STALE_TIME_MS = 60_000;

/** Read the per-source model list + state for a role slot; an unset source skips the query. */
export function useRoleSourceModels(source: string, role: RoutingRoleKey): { readonly result: SourceModelsResult | undefined; readonly isLoading: boolean } {
  const trpc = useTRPC();
  const enabled = source !== "";
  const query = useQuery({
    ...trpc.connection.getModelsForSource.queryOptions(enabled ? { source: source as CredentialSource, role } : skipToken),
    staleTime: FACADE_STALE_TIME_MS,
  });
  return { result: query.data, isLoading: query.isLoading && enabled };
}
