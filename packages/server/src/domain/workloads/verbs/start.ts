// verb: start — enqueue a `queued` row in a given MODE. Re-parses the input against the OWNING domain's
// contribution schema (defense in depth — the wire validates the envelope only, and mocked-procedure tests
// bypass it entirely). `dependsOn` is persisted here and enforced at dispatch (the DAG scheduler in
// `persistence/nextRunnableWorkload`) — start just records the edges.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import { DomainConflictError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { StartWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { isActiveKindUniqueViolation, isOwnerForeignKeyViolation } from "../persistence/constraints";
import { insertWorkload } from "../persistence/queries";
import { parseWorkloadInput, resolveWorkloadSource } from "../substrate/params";

/**
 * The MODE gate + the ROW OWNER (= runner enumeration scope) resolution, server-authoritative:
 *   1. the kind must support the requested mode (else BAD_REQUEST);
 *   2. a bulk run is BOX-OWNER-only (`requireOwner`) — a `null` caller is a trusted system trigger;
 *   3. singular → the caller's own id (or the system `ownerId`); bulk sweep-kind → `null` (all owners); bulk
 *      create-kind → the required `targetOwnerId` (BAD_REQUEST if absent — you can't mint ownerless rows).
 */
function authorizeAndResolveOwner(ctx: WorkloadServiceContext, params: StartWorkloadParams, kind: WorkloadKind): UserId | null {
  const mode = params.mode;
  const policy = WORKLOAD_KIND_MODES[kind];
  if ((mode === "singular" && !policy.singular) || (mode === "bulk" && !policy.bulk)) {
    throw new DomainOperationError("unsupported_mode", `"${kind}" does not support ${mode} mode`);
  }
  if (mode === "singular") {
    return params.caller !== null ? params.caller.userId : params.ownerId;
  }
  // bulk — BOX-OWNER only (a null caller is trusted system/scheduler/agent).
  if (params.caller !== null) {
    ctx.requireOwner(params.caller);
  }
  if (!policy.bulkRequiresTarget) {
    return null;
  }
  if (params.targetOwnerId === undefined || params.targetOwnerId === null) {
    throw new DomainOperationError("bulk_target_required", `a bulk "${kind}" run must designate a targetOwnerId (it mints owner-owned rows)`);
  }
  return params.targetOwnerId;
}

export function createStart(ctx: WorkloadServiceContext): Pick<WorkloadService, "start"> {
  async function start(params: StartWorkloadParams): Promise<{ id: WorkloadId }> {
    const contributions = ctx.getContributions();
    const input = parseWorkloadInput(contributions, params.input);
    const ownerId = authorizeAndResolveOwner(ctx, params, input.kind);
    const id = ctx.newWorkloadId();
    const now = ctx.now();
    try {
      await insertWorkload(ctx.db, {
        id,
        kind: input.kind,
        mode: params.mode,
        source: resolveWorkloadSource(input.kind, input.params),
        // The execution lane is the OWNING domain's declaration, stamped here so it survives a restart.
        lane: contributions[input.kind].lane,
        params: input.params as Record<string, unknown>,
        ownerId,
        dependsOn: params.dependsOn ?? null,
        scheduledAt: params.scheduledAt ?? now,
        createdAt: now,
      });
    } catch (err) {
      if (isActiveKindUniqueViolation(err)) {
        const conflict = new DomainConflictError(`a "${input.kind}" workload is already active`);
        conflict.cause = err;
        throw conflict;
      }
      if (isOwnerForeignKeyViolation(err)) {
        const notFound = new DomainNotFoundError("user", String(ownerId));
        notFound.cause = err;
        throw notFound;
      }
      throw err;
    }
    return { id };
  }
  return { start };
}
