// domain/connection — the domain's OWN background work, raised as a `WorkloadContribution` (the workloads
// junk-drawer exit: domains raise seams, the worker skims them). ONE kind: `refresh-model-catalog`.
//
// The periodic driver stays connection-private (`transport/jobs/catalog-refresh-scheduler.ts`), which reads
// the newest row's status/updatedAt as its cron ledger — a legitimate observability ride on the queue's
// durable history. What changes here is OWNERSHIP: the fan-out + the counts projection now live in the
// domain that owns the catalogs, not in a cross-feature hub at the entry tier.

import type { CatalogRefreshResult } from "@orb/contracts/connection";
import { emptyWorkloadParams } from "@orb/contracts/workloads";
import type { WorkloadContribution } from "#domain/workloads";
import type { ConnectionWorkloadDeps } from "./contract/service.ts";

/** `refresh-model-catalog` — refresh BOTH provider catalogs (OpenRouter `/models` + the agent-sdk daemon's
 *  supported-model map) and report COUNTS ONLY, so no provider entry shape leaks into the queue's wire. */
export function createConnectionWorkloadContributions(deps: ConnectionWorkloadDeps): readonly [WorkloadContribution<"refresh-model-catalog">] {
  return [
    {
      kind: "refresh-model-catalog",
      params: emptyWorkloadParams,
      // Two HTTP fetches — seconds. `sweep` keeps the periodic refresh off the interactive lane.
      lane: "sweep",
      // A refresh overwrites the snapshot wholesale; re-running is always safe.
      resume: "idempotent-restart",
      run: async (_ctx, _params, report, signal): Promise<CatalogRefreshResult> => {
        report({ message: "refreshing provider model catalogs" });
        // Both lanes run under allSettled so one lane's failure never discards the other's refresh; a failed
        // lane reports null (distinct from 0 = a real empty catalog). Only rethrows when BOTH lanes failed.
        const [or, agentSdk] = await Promise.allSettled([deps.connection.refreshCatalog({ signal }), deps.connection.refreshAgentSdkCatalog({ signal })]);
        if (or.status === "rejected" && agentSdk.status === "rejected") {
          throw or.reason;
        }
        return {
          models: or.status === "fulfilled" ? or.value.models.length : null,
          agentSdkModels: agentSdk.status === "fulfilled" ? agentSdk.value.models.length : null,
        };
      },
    },
  ];
}
