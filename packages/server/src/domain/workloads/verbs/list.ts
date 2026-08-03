// verb: list — filter by kind/status/owner/since (all optional), newest-first, hard-capped 500. Poison rows
// (a kind this build doesn't ship) are filtered by `toView`, never 500ing the read (deploy-skew tolerance).
//
// F3 AUTHZ: the owner filter is server-authoritative. A non-admin caller is FORCED to its own `userId` (any
// supplied `ownerId` is ignored — a user only ever lists its own workloads). An admin (or a `null` system
// caller) keeps the requested filter: undefined = the deployment-wide view across all owners, or narrow to one.

import type { ListWorkloadsParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import type { WorkloadRowAnyKind } from "../contract/workload-row.ts";
import { listWorkloads } from "../persistence/queries.ts";
import { resolveListOwnerFilter } from "../substrate/authorize.ts";

export function createList(ctx: WorkloadServiceContext): Pick<WorkloadService, "list"> {
  async function list(params: ListWorkloadsParams): Promise<readonly WorkloadRowAnyKind[]> {
    const ownerId = resolveListOwnerFilter(ctx.isAdmin, params.caller, params.ownerId);
    return await listWorkloads(ctx.db, ctx.getContributions(), {
      ...(params.kind !== undefined ? { kind: params.kind } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...(ownerId !== undefined ? { ownerId } : {}),
      ...(params.since !== undefined ? { since: params.since } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    });
  }
  return { list };
}
