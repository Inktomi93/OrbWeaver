// verb: cancel — request a stop on one row. Delegates to the race-safe, idempotent `markCancelling`: a
// queued row flips to `cancelled`, a running row to `cancelling` (the engine's cancel-poll then aborts the
// run asynchronously), an already-cancelling row stays `cancelling` (idempotent), a terminal row is a no-op
// (`null`). The verb does NOT block on the runner exiting — it returns the transition that happened.
//
// F3 AUTHZ: the row is loaded + visibility-gated BEFORE any state change — a non-admin caller cancelling a
// workload it doesn't own (or a bogus id) gets a leak-free `DomainNotFoundError` and NOTHING is mutated. A
// visible terminal row still no-ops (`null`) via `markCancelling` (idempotent — rows are never deleted, so a
// completed-then-cancelled double call stays a no-op, not a throw).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { CancelWorkloadParams, CancelWorkloadResult } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { loadWorkload, markCancelling } from "../persistence/queries";
import { isVisibleToCaller } from "../substrate/authorize";

const ENTITY = "workload";

export function createCancel(ctx: WorkloadServiceContext): Pick<WorkloadService, "cancel"> {
  async function cancel(params: CancelWorkloadParams): Promise<CancelWorkloadResult> {
    const row = await loadWorkload(ctx.db, params.id);
    if (row === null || !isVisibleToCaller(ctx.isAdmin, params.caller, row.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    return await markCancelling(ctx.db, params.id, ctx.now());
  }
  return { cancel };
}
