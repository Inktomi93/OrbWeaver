// verb: get — one typed row by id (throws `DomainNotFoundError` when absent OR poison — a kind this build
// doesn't ship narrows to null in `toView`, treated as not-found rather than 500ing). `ownerId` is the audit
// subject, not an authz input yet (§7.1).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { GetWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import type { WorkloadRowAnyKind } from "../contract/workload-row";
import { loadWorkload } from "../persistence/queries";

const ENTITY = "workload";

export function createGet(ctx: WorkloadServiceContext): Pick<WorkloadService, "get"> {
  async function get(params: GetWorkloadParams): Promise<WorkloadRowAnyKind> {
    const row = await loadWorkload(ctx.db, params.id);
    if (row === null) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    return row;
  }
  return { get };
}
