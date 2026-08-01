// verb: retry — clones a row's kind+params+dependsOn into a fresh queued row; never mutates the original
// (the failure row stays as the audit trail). Subject to the same single-active constraint (collides →
// DomainConflictError). The clone preserves the original's mode + ownerId; a bulk original requires the
// box owner, same as starting one. The LANE is re-stamped from the kind's CURRENT contribution (a lane is
// the owning domain's live declaration, not a property of the failed attempt).
//
// A POISON original (params that no longer parse) is retryable BY DESIGN — that is the point of surfacing it
// instead of dropping it — and clones the RAW params blob so the operator's original input survives verbatim
// into a build that may have fixed the schema.

import type { WorkloadSource } from "@orb/contracts/workloads";
import { NON_INDEX_SOURCE } from "@orb/contracts/workloads";
import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import type { RetryWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import type { WorkloadRowAnyKind } from "../contract/workload-row";
import { isActiveKindUniqueViolation } from "../persistence/constraints";
import { insertWorkload, loadRawWorkloadParams, loadWorkload } from "../persistence/queries";
import { isVisibleToCaller } from "../substrate/authorize";
import { resolveWorkloadSource } from "../substrate/params";

const ENTITY = "workload";

/** The clone's params + lock partition. A HEALTHY row re-uses its parsed params (and its `index` source
 *  sub-partition). A POISON row carries the RAW blob verbatim — its parsed view is `null`, and the source
 *  sub-partition is itself a params read, so the clone locks under the shared `none` bucket. */
async function resolveCloneParams(
  ctx: WorkloadServiceContext,
  original: WorkloadRowAnyKind,
): Promise<{ params: Record<string, unknown>; source: WorkloadSource }> {
  if (original.poison) {
    return { params: (await loadRawWorkloadParams(ctx.db, original.id)) ?? {}, source: NON_INDEX_SOURCE };
  }
  return {
    params: original.params as Record<string, unknown>,
    source: resolveWorkloadSource(original.kind, original.params),
  };
}

export function createRetry(ctx: WorkloadServiceContext): Pick<WorkloadService, "retry"> {
  async function retry(params: RetryWorkloadParams): Promise<{ id: WorkloadId }> {
    const contributions = ctx.getContributions();
    const original = await loadWorkload(ctx.db, contributions, params.id);
    if (original === null || !isVisibleToCaller(ctx.isAdmin, params.caller, original.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    if (params.caller !== null && original.mode === "bulk") {
      ctx.requireOwner(params.caller);
    }
    const clone = await resolveCloneParams(ctx, original);
    const id = ctx.newWorkloadId();
    const now = ctx.now();
    try {
      await insertWorkload(ctx.db, {
        id,
        kind: original.kind,
        mode: original.mode,
        source: clone.source,
        lane: contributions[original.kind].lane,
        params: clone.params,
        ownerId: original.ownerId,
        dependsOn: original.dependsOn,
        scheduledAt: now,
        createdAt: now,
      });
    } catch (err) {
      if (isActiveKindUniqueViolation(err)) {
        const conflict = new DomainConflictError(`a "${original.kind}" workload is already active`);
        conflict.cause = err;
        throw conflict;
      }
      throw err;
    }
    return { id };
  }
  return { retry };
}
