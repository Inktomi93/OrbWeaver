// verb: deleteSchedule — remove a schedule by id (owner-scoped). Loads + visibility-checks FIRST (a foreign
// or absent id collapses to the leak-free NOT_FOUND with NO state change — never a FORBIDDEN existence
// oracle). Schedules are live config, not a retained audit row, so the row is hard-deleted.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { DeleteScheduleParams } from "../contract/schedule";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { deleteScheduleRow, loadSchedule } from "../persistence/schedule-queries";
import { isVisibleToCaller } from "../substrate/authorize";

const ENTITY = "workload_schedule";

export function createDeleteSchedule(
  ctx: WorkloadServiceContext,
): Pick<WorkloadService, "deleteSchedule"> {
  async function deleteSchedule(params: DeleteScheduleParams): Promise<void> {
    const existing = await loadSchedule(ctx.db, params.id);
    if (existing === null || !isVisibleToCaller(ctx.isAdmin, params.caller, existing.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    await deleteScheduleRow(ctx.db, params.id);
  }
  return { deleteSchedule };
}
