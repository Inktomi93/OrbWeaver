// verb: listSchedules — the caller's schedules, newest-first (owner-scoped). F3 AUTHZ: a non-admin caller is
// FORCED to its own `userId` (any supplied `ownerId` is ignored — server-authoritative); an admin (or a
// `null` system caller) keeps the requested filter (undefined = the deployment-wide view).

import type { ListSchedulesParams, WorkloadScheduleRow } from "../contract/schedule.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { listSchedulesQuery } from "../persistence/schedule-queries.ts";
import { resolveListOwnerFilter } from "../substrate/authorize.ts";

export function createListSchedules(ctx: WorkloadServiceContext): Pick<WorkloadService, "listSchedules"> {
  async function listSchedules(params: ListSchedulesParams): Promise<readonly WorkloadScheduleRow[]> {
    // A schedule row's owner is NOT NULL, so a `null` scope (an admin explicitly asking for null-owned) can
    // match nothing — only a concrete owner id narrows; undefined leaves it deployment-wide.
    const scoped = resolveListOwnerFilter(ctx.isAdmin, params.caller, params.ownerId ?? undefined);
    return await listSchedulesQuery(ctx.db, {
      ...(scoped !== null && scoped !== undefined ? { ownerId: scoped } : {}),
      ...(params.kind !== undefined ? { kind: params.kind } : {}),
    });
  }
  return { listSchedules };
}
