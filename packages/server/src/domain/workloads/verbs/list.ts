// verb: list — filter by kind/status/owner/since (all optional), newest-first, hard-capped 500. Poison rows
// (a kind this build doesn't ship) are filtered by `toView`, never 500ing the read (deploy-skew tolerance).

import type { ListWorkloadsParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import type { WorkloadRowAnyKind } from "../contract/workload-row";
import { listWorkloads } from "../persistence/queries";

export function createList(ctx: WorkloadServiceContext): Pick<WorkloadService, "list"> {
  async function list(params: ListWorkloadsParams): Promise<readonly WorkloadRowAnyKind[]> {
    return await listWorkloads(ctx.db, params);
  }
  return { list };
}
