// verb: get — one typed row by id. A row whose params or stored result no longer parse returns as poison with
// `params: null`, and a result that no longer parses reads as `null`; `DomainNotFoundError` means absent, or a kind this build doesn't ship (`readRow`
// narrows it to null rather than 500ing).
//
// F3 AUTHZ: a non-admin caller may only see its OWN workload — a row it doesn't own collapses to the SAME
// leak-free `DomainNotFoundError` as an absent one (never a FORBIDDEN existence oracle). A `null` (system)
// caller or an admin sees any row.

import type { WorkloadRowAnyKind } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { GetWorkloadParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { loadWorkload } from "../persistence/queries.ts";
import { isVisibleToCaller } from "../substrate/authorize.ts";
import { workloadReads } from "../substrate/params.ts";

const ENTITY = "workload";

export function createGet(ctx: WorkloadServiceContext): Pick<WorkloadService, "get"> {
  async function get(params: GetWorkloadParams): Promise<WorkloadRowAnyKind> {
    const row = await loadWorkload(ctx.db, workloadReads(ctx), params.id, (access) => isVisibleToCaller(ctx.isAdmin, params.caller, access.ownerId));
    if (row === null) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    return row;
  }
  return { get };
}
