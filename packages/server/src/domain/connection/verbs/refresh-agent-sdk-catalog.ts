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

export function createRefreshAgentSdkCatalog(ctx: ConnectionContext): ConnectionService["refreshAgentSdkCatalog"] {
  return async (params: RefreshCatalogParams): Promise<AgentSdkCatalogSnapshot> => {
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
