// verb: cancel — request a stop on one row. Delegates to the race-safe, idempotent `markCancelling`: a
// queued row flips to `cancelled`, a running row to `cancelling` (the engine's cancel-poll then aborts the
// run asynchronously), an already-cancelling row stays `cancelling` (idempotent), a terminal/absent row is a
// no-op (`null`). The verb does NOT block on the runner exiting — it returns the transition that happened.
// `ownerId` is the audit subject, NOT yet an authorization input (the `adminProcedure` gate is — §7.1).

import type { CancelWorkloadParams, CancelWorkloadResult } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { markCancelling } from "../persistence/queries";

export function createCancel(ctx: WorkloadServiceContext): Pick<WorkloadService, "cancel"> {
  async function cancel(params: CancelWorkloadParams): Promise<CancelWorkloadResult> {
    return await markCancelling(ctx.db, params.id, ctx.now());
  }
  return { cancel };
}
