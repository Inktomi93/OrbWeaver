// verb: retry — clones a row's kind+params+dependsOn into a fresh queued row; never mutates the original
// (the failure row stays as the audit trail). Subject to the same single-active constraint (collides →
// DomainConflictError). The clone preserves the original's mode + ownerId; a bulk original requires the
// box owner, same as starting one.

import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import type { RetryWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { isActiveKindUniqueViolation } from "../persistence/constraints";
import { insertWorkload, loadWorkload } from "../persistence/queries";
import { isVisibleToCaller } from "../substrate/authorize";
import { resolveWorkloadSource } from "../substrate/params";

const ENTITY = "workload";

export function createRetry(ctx: WorkloadServiceContext): Pick<WorkloadService, "retry"> {
  async function retry(params: RetryWorkloadParams): Promise<{ id: WorkloadId }> {
    const original = await loadWorkload(ctx.db, ctx.getContributions(), params.id);
    if (original === null || !isVisibleToCaller(ctx.isAdmin, params.caller, original.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    if (params.caller !== null && original.mode === "bulk") {
      ctx.requireOwner(params.caller);
    }
    const id = ctx.newWorkloadId();
    const now = ctx.now();
    try {
      await insertWorkload(ctx.db, {
        id,
        kind: original.kind,
        mode: original.mode,
        source: resolveWorkloadSource(original.kind, original.params),
        params: original.params as Record<string, unknown>,
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
