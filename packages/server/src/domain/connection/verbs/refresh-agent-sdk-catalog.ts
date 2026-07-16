// verb: refreshAgentSdkCatalog — run the agent-sdk daemon's `supportedModels()` discovery, persist the
// snapshot, warm the cache (the daily-workload entry point). Mirrors `refresh-catalog.ts` (the OR half).
// Calls the injected `providers.fetchAgentSdkModels` (the live control-channel discovery — connection owns
// the SNAPSHOT, providers owns the I/O), writes the KV row, and seeds the in-memory TTL cache immediately
// so the next alias resolution reads it without a re-read. On a discovery failure it falls back to the
// persisted snapshot if one exists (stale-but-serviceable), else throws `AgentSdkCatalogUnavailableError`
// (flagged, not a silent empty — best-effort, never fake).

import type { ConnectionContext } from "../context";
import { AgentSdkCatalogUnavailableError } from "../contract/errors";
import type { RefreshCatalogParams } from "../contract/params";
import type { AgentSdkCatalogSnapshot } from "../contract/results";
import type { ConnectionService } from "../contract/service";
import { readAgentSdkCatalogSnapshot, writeAgentSdkCatalogSnapshot } from "../persistence/agent-sdk-catalog-snapshot";
import { seedAgentSdkModelCache } from "../substrate/agent-sdk-model-cache";

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
    await writeAgentSdkCatalogSnapshot(ctx.db, snapshot);
    // Warm the sync TTL cache immediately so the next alias resolution reads fresh without a re-read.
    seedAgentSdkModelCache(snapshot.models, snapshot.fetchedAt);
    return snapshot;
  };
}
