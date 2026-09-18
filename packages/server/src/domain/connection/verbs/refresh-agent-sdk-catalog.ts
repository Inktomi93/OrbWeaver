// verb: refreshAgentSdkCatalog — run the agent-sdk daemon's `supportedModels()` discovery, persist the
// snapshot, warm the cache (the daily-workload entry point). Mirrors `refresh-catalog.ts` (the OR half).
// Calls the injected `providers.fetchAgentSdkModels` (the live control-channel discovery — connection owns
// the SNAPSHOT, providers owns the I/O), writes the KV row, and seeds the in-memory TTL cache immediately
// so the next alias resolution reads it without a re-read. On a discovery failure it falls back to the
// persisted snapshot if one exists (stale-but-serviceable), else throws `AgentSdkCatalogUnavailableError`
// (flagged, not a silent empty — best-effort, never fake).

import type { ConnectionContext } from "../context.ts";
import { AgentSdkCatalogUnavailableError } from "../contract/errors.ts";
import type { RefreshCatalogParams } from "../contract/params.ts";
import type { AgentSdkCatalogSnapshot } from "../contract/results.ts";
import type { ConnectionService } from "../contract/service.ts";
import { persistAgentSdkCatalogSnapshot, readAgentSdkCatalogSnapshot } from "../persistence/agent-sdk-catalog-snapshot.ts";

/** Nothing has ever been discovered — the same shape `getAgentSdkCatalog` serves for a never-refreshed box. */
const EMPTY_SNAPSHOT: AgentSdkCatalogSnapshot = { fetchedAt: 0, models: [] };

export function createRefreshAgentSdkCatalog(ctx: ConnectionContext): ConnectionService["refreshAgentSdkCatalog"] {
  return async (params: RefreshCatalogParams): Promise<AgentSdkCatalogSnapshot> => {
    // THE BOOT SPAWN'S ORIGIN (2026-09-18): the catalog-refresh scheduler runs one check IMMEDIATELY at
    // boot, which enqueues the `refresh-model-catalog` workload, whose agent-sdk lane lands here and forks
    // the bundled claude runtime. On a box with no host-Claude backend that child could only ever fail, on
    // every container restart. An absent backend is a NORMAL state, not an outage: serve whatever is
    // persisted (else the empty snapshot) and never call the discovery op. The `requireBackend` refusal
    // behind it is the belt; this is the arm that keeps the queue quiet.
    if (!ctx.hostClaudeAvailable) {
      return (await readAgentSdkCatalogSnapshot(ctx.db)) ?? EMPTY_SNAPSHOT;
    }
    let models: AgentSdkCatalogSnapshot["models"];
    try {
      models = await ctx.fetchAgentSdkModels({ signal: params.signal });
    } catch (err) {
      const existing = await readAgentSdkCatalogSnapshot(ctx.db);
      if (existing !== null) {
        return existing;
      }
      throw new AgentSdkCatalogUnavailableError(err instanceof Error ? err.message : String(err), {
        cause: err,
      });
    }
    const snapshot: AgentSdkCatalogSnapshot = { fetchedAt: ctx.now(), models };
    // Persist + warm the sync TTL mirror in one call, so the next alias resolution + capability synthesis read
    // fresh truth without a re-read (`persistAgentSdkCatalogSnapshot` is the one home for the pair).
    await persistAgentSdkCatalogSnapshot(ctx.db, snapshot);
    return snapshot;
  };
}
