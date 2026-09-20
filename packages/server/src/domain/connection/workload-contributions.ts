// domain/connection — the domain's OWN background work, raised as a `WorkloadContribution` (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). ONE kind: `refresh-model-catalog`.
//
// ONE lane now (inference program §4 "catalog/ CALLOUT"): the OpenRouter enrichment (`/models` is keyless).
// The agent-sdk daemon catalog needs a CREDENTIAL — a per-user `claude-sub` row — so a scheduled workload
// with no principal cannot warm it; it warms on demand under the calling user's row at first resolve and
// `agentSdkModels` is `null`-by-design here.

import type { CatalogRefreshResult } from "@orb/contracts/inference";
import { emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { ConnectionWorkloadDeps } from "./contract/service.ts";

const OPENROUTER_PROVIDER_ID = "openrouter";

export function createConnectionWorkloadContributions(deps: ConnectionWorkloadDeps): readonly [WorkloadContribution<"refresh-model-catalog">] {
  return [
    {
      kind: "refresh-model-catalog",
      params: emptyWorkloadParams,
      lane: "sweep",
      resume: "idempotent-restart",
      run: async (_ctx, _params, report, signal): Promise<CatalogRefreshResult> => {
        report({ message: "refreshing the OpenRouter model catalog" });
        const outcome = await deps.connection.refreshCatalog({ providerId: OPENROUTER_PROVIDER_ID, signal });
        return { models: outcome.models, agentSdkModels: null };
      },
    },
  ];
}
