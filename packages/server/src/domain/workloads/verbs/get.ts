// verb: get — one typed row by id (throws `DomainNotFoundError` when absent OR poison — a kind this build
// doesn't ship narrows to null in `toView`, treated as not-found rather than 500ing).
//
// F3 AUTHZ: a non-admin caller may only see its OWN workload — a row it doesn't own collapses to the SAME
// leak-free `DomainNotFoundError` as an absent one (never a FORBIDDEN existence oracle). A `null` (system)
// caller or an admin sees any row.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { GetWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import type { WorkloadRowAnyKind } from "../contract/workload-row";
import { loadWorkload } from "../persistence/queries";
import { isVisibleToCaller } from "../substrate/authorize";

const ENTITY = "workload";

export function createGet(ctx: WorkloadServiceContext): Pick<WorkloadService, "get"> {
  async function get(params: GetWorkloadParams): Promise<WorkloadRowAnyKind> {
    const row = await loadWorkload(ctx.db, params.id);
    if (row === null || !isVisibleToCaller(ctx.isAdmin, params.caller, row.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    return row;
  }
  return { get };
}
