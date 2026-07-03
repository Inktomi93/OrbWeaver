// verb: retry — CLONE a row's kind+params+dependsOn into a FRESH `queued` row; NEVER mutates the original
// (the original failure row stays as the audit trail). The clone is subject to the same
// single-active constraint, so a still-active kind collides → `DomainConflictError`. `dependsOn` rides along
// but is still NOT enforced (the warn-seam mirrors `start`).

import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { RetryWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { isActiveKindUniqueViolation } from "../persistence/constraints";
import { insertWorkload, loadWorkload } from "../persistence/queries";

const ENTITY = "workload";

export function createRetry(ctx: WorkloadServiceContext): Pick<WorkloadService, "retry"> {
  async function retry(params: RetryWorkloadParams): Promise<{ id: WorkloadId }> {
    const original = await loadWorkload(ctx.db, params.id);
    if (original === null) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    if (original.dependsOn !== null && original.dependsOn.length > 0) {
      getLog().warn(
        { kind: original.kind, dependsOn: original.dependsOn },
        "workloads: retried dependsOn is persisted but NOT enforced — dispatch ignores it",
      );
    }
    const id = ctx.newWorkloadId();
    const now = ctx.now();
    try {
      await insertWorkload(ctx.db, {
        id,
        kind: original.kind,
        params: original.params as Record<string, unknown>,
        ownerId: params.ownerId,
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
