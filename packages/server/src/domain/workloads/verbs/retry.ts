// verb: retry — CLONE a row's kind+params+dependsOn into a FRESH `queued` row; NEVER mutates the original
// (the original failure row stays as the audit trail). The clone is subject to the same
// single-active constraint, so a still-active kind collides → `DomainConflictError`. `dependsOn` rides along
// but is still NOT enforced (the warn-seam mirrors `start`).
//
// MODE AUTHZ: the original is visibility-gated (a caller retrying a workload it can't see → leak-free
// `DomainNotFoundError`, no clone) AND a BULK original requires the BOX OWNER (`requireOwner`) — re-running a
// bulk pass is owner-only, same as starting one. The clone PRESERVES the original's `mode` + `ownerId` — a
// retry re-runs THAT owner's job in the SAME mode (so it honors the same single-active lock partition + stays
// in the owner's space), never re-homes or re-modes it.

import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { RetryWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { isActiveKindUniqueViolation } from "../persistence/constraints";
import { insertWorkload, loadWorkload } from "../persistence/queries";
import { isVisibleToCaller } from "../substrate/authorize";

const ENTITY = "workload";

export function createRetry(ctx: WorkloadServiceContext): Pick<WorkloadService, "retry"> {
  async function retry(params: RetryWorkloadParams): Promise<{ id: WorkloadId }> {
    const original = await loadWorkload(ctx.db, params.id);
    if (original === null || !isVisibleToCaller(ctx.isAdmin, params.caller, original.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    // Re-running a BULK pass is BOX-OWNER-only, same as starting one (a non-owner can't reach a bulk row it
    // doesn't own anyway — not visible — but the gate is defense in depth). A `null` caller is trusted system.
    if (params.caller !== null && original.mode === "bulk") {
      ctx.requireOwner(params.caller);
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
        mode: original.mode,
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
