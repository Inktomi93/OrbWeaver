// verb: cancel — request a stop on one row via the race-safe, idempotent markCancelling: queued → cancelled,
// running → cancelling (the engine's cancel-poll aborts async), terminal → no-op (null). The row is loaded
// and visibility-gated before any state change — a caller cancelling a workload it doesn't own gets a
// leak-free DomainNotFoundError and nothing is mutated.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { CancelWorkloadParams, CancelWorkloadResult } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { loadWorkload, markCancelling } from "../persistence/queries.ts";
import { isVisibleToCaller } from "../substrate/authorize.ts";

const ENTITY = "workload";

export function createCancel(ctx: WorkloadServiceContext): Pick<WorkloadService, "cancel"> {
  async function cancel(params: CancelWorkloadParams): Promise<CancelWorkloadResult> {
    const row = await loadWorkload(ctx.db, ctx.getContributions(), params.id);
    if (row === null || !isVisibleToCaller(ctx.isAdmin, params.caller, row.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    return await markCancelling(ctx.db, params.id, ctx.now());
  }
  return { cancel };
}
