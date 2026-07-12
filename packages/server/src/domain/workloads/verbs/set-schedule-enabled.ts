// verb: setScheduleEnabled — pause/resume a schedule by id (owner-scoped). Loads + visibility-checks FIRST (a
// foreign or absent id collapses to the leak-free NOT_FOUND). A disabled schedule stays but the tick never
// enqueues from it (`findDueSchedules` filters on `enabled`).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { SetScheduleEnabledParams, WorkloadScheduleRow } from "../contract/schedule";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { loadSchedule, setScheduleEnabledQuery } from "../persistence/schedule-queries";
import { isVisibleToCaller } from "../substrate/authorize";

const ENTITY = "workload_schedule";

export function createSetScheduleEnabled(
  ctx: WorkloadServiceContext,
): Pick<WorkloadService, "setScheduleEnabled"> {
  async function setScheduleEnabled(
    params: SetScheduleEnabledParams,
  ): Promise<WorkloadScheduleRow> {
    const existing = await loadSchedule(ctx.db, params.id);
    if (existing === null || !isVisibleToCaller(ctx.isAdmin, params.caller, existing.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    const updated = await setScheduleEnabledQuery(ctx.db, params.id, params.enabled, ctx.now());
    if (updated === null) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    return updated;
  }
  return { setScheduleEnabled };
}
