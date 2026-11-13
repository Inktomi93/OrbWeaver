// verb: cancel — request a stop on one row via the race-safe, idempotent markCancelling: queued → cancelled,
// running → cancelling (the run is aborted at once in this process; the engine's cancel-poll covers any other), terminal → no-op (null). The row is loaded
// and visibility-gated before any state change — a caller cancelling a workload it doesn't own gets a
// leak-free DomainNotFoundError and nothing is mutated. A delegated admin cancelling the box owner's run gets the
// same answer (`mayActOnRow`, D17).

import type { CancelWorkloadResult } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CancelWorkloadParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { loadStoredParams, loadWorkload, markCancelling } from "../persistence/queries.ts";
import { isVisibleToCaller, mayActOnRow } from "../substrate/authorize.ts";
import { releaseUnrun } from "../substrate/params.ts";

const ENTITY = "workload";

export function createCancel(ctx: WorkloadServiceContext): Pick<WorkloadService, "cancel"> {
  async function cancel(params: CancelWorkloadParams): Promise<CancelWorkloadResult> {
    const row = await loadWorkload(ctx.db, ctx.getContributions(), params.id, (access) => isVisibleToCaller(ctx.isAdmin, params.caller, access.ownerId));
    if (row === null || !(await mayActOnRow(ctx, params.caller, row))) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    const at = ctx.now();
    const result = await markCancelling(ctx.db, params.id, at);
    if (result.status === "cancelled") {
      ctx.emitEvent({ type: "cancelled", workloadId: row.id, kind: row.kind, at });
      // The status guard let this row end here or in the worker's claim, never both, so it never ran. A poison
      // row's view has no params, so its stored value is read for the owning domain to find what it holds.
      const stored = row.poison ? await loadStoredParams(ctx.db, row.id) : row.params;
      await releaseUnrun(ctx.getContributions(), row.kind, stored, row.ownerId);
    }
    if (result.status === "cancelling") {
      // The run is in flight: abort it here, so the kind's single slot frees when the run unwinds and not a poll later.
      ctx.abortRun(row.id);
    }
    return result;
  }
  return { cancel };
}
