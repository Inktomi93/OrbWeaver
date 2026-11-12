// verb: listSchedules — the caller's schedules, newest-first (owner-scoped). F3 AUTHZ: a non-admin caller is
// FORCED to its own `userId` (any supplied `ownerId` is ignored — server-authoritative); an admin (or a
// `null` system caller) keeps the requested filter (undefined = the deployment-wide view).
// Each row carries the refusal its tick meets, judged as the tick judges it, so a schedule that starts nothing says why.

import { WORKLOAD_RUN_ACCOUNT_NOT_OWNER } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { ListSchedulesParams, WorkloadScheduleListItem, WorkloadScheduleRow } from "../contract/schedule.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { listSchedulesQuery } from "../persistence/schedule-queries.ts";
import { resolveListOwnerFilter } from "../substrate/authorize.ts";
import { runAuthorityRefusal } from "../substrate/params.ts";

async function tickRefusal(ctx: WorkloadServiceContext, schedule: WorkloadScheduleRow): Promise<typeof WORKLOAD_RUN_ACCOUNT_NOT_OWNER | null> {
  const contributions = ctx.getContributions();
  const params = contributions[schedule.kind].params.safeParse(schedule.params);
  if (!params.success) {
    return null;
  }
  const refusal = await runAuthorityRefusal(
    { contributions, isBoxOwner: ctx.isBoxOwner, isAccountEnabled: ctx.isAccountEnabled },
    { caller: null, account: schedule.ownerId },
    schedule.kind,
    params.data,
  );
  return refusal instanceof DomainOperationError && refusal.code === WORKLOAD_RUN_ACCOUNT_NOT_OWNER ? WORKLOAD_RUN_ACCOUNT_NOT_OWNER : null;
}

export function createListSchedules(ctx: WorkloadServiceContext): Pick<WorkloadService, "listSchedules"> {
  async function listSchedules(params: ListSchedulesParams): Promise<readonly WorkloadScheduleListItem[]> {
    // A schedule row's owner is NOT NULL, so a `null` scope (an admin explicitly asking for null-owned) can
    // match nothing — only a concrete owner id narrows; undefined leaves it deployment-wide.
    const scoped = resolveListOwnerFilter(ctx.isAdmin, params.caller, params.ownerId ?? undefined);
    const rows = await listSchedulesQuery(ctx.db, {
      ...(scoped !== null && scoped !== undefined ? { ownerId: scoped } : {}),
      ...(params.kind !== undefined ? { kind: params.kind } : {}),
    });
    return await Promise.all(
      rows.map(async (row): Promise<WorkloadScheduleListItem> => {
        const refusal = await tickRefusal(ctx, row);
        return refusal === null ? row : { ...row, refusal };
      }),
    );
  }
  return { listSchedules };
}
