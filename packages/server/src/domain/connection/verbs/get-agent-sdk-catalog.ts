// verb: getAgentSdkCatalog — read the persisted agent-sdk model-catalog snapshot (the daemon's
// family→version map). Mirrors `get-catalog.ts` (the OR half). The read warms the in-memory TTL cache as a
// side-effect (persistence/readAgentSdkCatalogSnapshot — the warm-on-read seam). A never-refreshed account
// reads the empty snapshot (`fetchedAt:0, models:[]`) rather than throwing; `refreshAgentSdkCatalog`
// populates it.

import type { GetCatalogParams } from "../contract/params";
import type { AgentSdkCatalogSnapshot } from "../contract/results";
import type { ConnectionContext, ConnectionService } from "../contract/service";
import { readAgentSdkCatalogSnapshot } from "../persistence/agent-sdk-catalog-snapshot";

const EMPTY_SNAPSHOT: AgentSdkCatalogSnapshot = { fetchedAt: 0, models: [] };

export function createGetAgentSdkCatalog(
  ctx: ConnectionContext,
): ConnectionService["getAgentSdkCatalog"] {
  return async (_params: GetCatalogParams): Promise<AgentSdkCatalogSnapshot> => {
    const snapshot = await readAgentSdkCatalogSnapshot(ctx.db);
    return snapshot ?? EMPTY_SNAPSHOT;
  };
}
