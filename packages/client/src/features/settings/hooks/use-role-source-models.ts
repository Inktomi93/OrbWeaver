// The per-row facade read (Settings → Connections → Model roles). One `connection.getModelsForSource` query
// per CONFIGURED (source, role) pair — the read the source-polymorphic model cell AND the status dot share
// (CONNECTIONS-BUILD-SPEC §3.10). Standard react-query dedupe: two rows on the same (source, role) hit one
// fetch; a generous `staleTime` (~60s) rides the snapshots' server-side TTL cache (or-model-cache 1h TTL),
// so a settings-pane reopen never re-reads.
//
// GATED: the query is skipped for a source that has NO facade read — the empty/unset source ("") ghosts the
// resolver default (no per-source list to fetch), so the row passes `""` and we `skipToken` (never build a
// key for an invalid source — the §11.5 empty-id-sentinel discipline). A stable `staleTime` is fine here
// (this is a config snapshot read, NOT a bus-driven live key — the no-static-staletime-on-bus-keys gate
// scopes to bus keys).

import type { RoutingRoleKey } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useTRPC } from "#data";

/** The facade result the client receives (tRPC inference — kept local, never an exported feature type). */
type SourceModelsResult = inferOutput<Trpc["connection"]["getModelsForSource"]>;

const FACADE_STALE_TIME_MS = 60_000;

/** Read the per-source model list + state for a role slot. `source` is the LIVE form value (`""` = unset);
 *  an unset source skips the query (the ghost path). Returns the facade result + loading flag for the
 *  model cell and the status dot. */
export function useRoleSourceModels(
  source: string,
  role: RoutingRoleKey,
): { readonly result: SourceModelsResult | undefined; readonly isLoading: boolean } {
  const trpc = useTRPC();
  const enabled = source !== "";
  const query = useQuery({
    ...trpc.connection.getModelsForSource.queryOptions(
      enabled ? { source: source as CredentialSource, role } : skipToken,
    ),
    staleTime: FACADE_STALE_TIME_MS,
  });
  return { result: query.data, isLoading: query.isLoading && enabled };
}
