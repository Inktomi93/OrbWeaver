// verb: retry — clones a row's kind+params+dependsOn into a fresh queued row; never mutates the original
// (the failure row stays as the audit trail). Subject to the same single-active constraint (collides →
// DomainConflictError). The clone preserves the original's mode + ownerId; a bulk original requires the
// box owner, same as starting one. The LANE is re-stamped from the kind's CURRENT contribution (a lane is
// the owning domain's live declaration, not a property of the failed attempt).
//
// A POISON original (params that no longer parse) is retryable BY DESIGN — that is the point of surfacing it
// instead of dropping it — and clones the RAW params blob so the operator's original input survives verbatim
// into a build that may have fixed the schema.

import { DEFAULT_ADMISSION_KEY } from "@orb/contracts/workloads";
import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadContributions } from "../contract/contribution.ts";
import type { RetryWorkloadParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import type { WorkloadRowAnyKind } from "../contract/workload-row.ts";
import { isActiveKindUniqueViolation } from "../persistence/constraints.ts";
import { insertWorkload, loadRawWorkloadParams, loadWorkload } from "../persistence/queries.ts";
import { isVisibleToCaller } from "../substrate/authorize.ts";
import { activeConflictMessage, resolveAdmissionKey } from "../substrate/params.ts";

const ENTITY = "workload";

/** The clone's params + admission key. A HEALTHY row re-uses its parsed params and re-derives its key from the
 *  kind's CURRENT contribution (the same live-declaration rule the lane follows). A POISON row carries the RAW
 *  blob verbatim — its parsed view is `null`, and an admission key is itself a params read, so the clone locks
 *  under the shared `none` bucket. */
async function resolveCloneParams(
  ctx: WorkloadServiceContext,
  contributions: WorkloadContributions,
  original: WorkloadRowAnyKind,
): Promise<{ params: Record<string, unknown>; admissionKey: string }> {
  if (original.poison) {
    return { params: (await loadRawWorkloadParams(ctx.db, original.id)) ?? {}, admissionKey: DEFAULT_ADMISSION_KEY };
  }
  return {
    params: original.params as Record<string, unknown>,
    admissionKey: resolveAdmissionKey(contributions, original.kind, original.params),
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
    const clone = await resolveCloneParams(ctx, contributions, original);
    const id = ctx.newWorkloadId();
    const now = ctx.now();
    try {
      await insertWorkload(ctx.db, {
        id,
        kind: original.kind,
        mode: original.mode,
        admissionKey: clone.admissionKey,
        lane: contributions[original.kind].lane,
        params: clone.params,
        ownerId: original.ownerId,
        dependsOn: original.dependsOn,
        scheduledAt: now,
        createdAt: now,
      });
    } catch (err) {
      if (isActiveKindUniqueViolation(err)) {
        const conflict = new DomainConflictError(activeConflictMessage(original.kind));
        conflict.cause = err;
        throw conflict;
      }
      throw err;
    }
    return { id };
  }
  return { retry };
}
