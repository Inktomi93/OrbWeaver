// verb: start — enqueue a `queued` row in a given MODE. RE-PARSES the `StartWorkloadInput` union (defense in
// depth — the wire validated, but mocked-procedure tests bypass that validator).
//
// MODE authz (layer 2 — the verb re-gates even off a non-tRPC path):
//   1. MODE SUPPORT: the kind must support the requested mode (`WORKLOAD_KIND_MODES`) — else a BAD_REQUEST.
//   2. AUTHORITY: a `bulk` run requires the BOX OWNER (`requireOwner`); a `singular` run is any authed caller.
//      A `null` caller is a TRUSTED system/scheduler/agent trigger (no gate).
//   3. ROW OWNER (= the runner's enumeration scope): singular → the caller's own id (server-authoritative — a
//      request can't stamp a foreign owner); bulk SWEEP-kind → `null` (all owners); bulk CREATE-kind → the
//      designated `targetOwnerId` (required — you can't mint ownerless rows). A bad target trips the owner FK
//      on INSERT → a leak-free NOT_FOUND.
// It catches the single-active collision (`isActiveKindUniqueViolation`) → `DomainConflictError`. `dependsOn`
// is PERSISTED here and ENFORCED at dispatch (the §2 DAG scheduler in `persistence/nextRunnableWorkload`): the
// row waits until every dep succeeds, or fails with `dependency_failed` if a dep does not — `start` just
// records the edges.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import { DomainConflictError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { StartWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { resolveWorkloadSource, startWorkloadInput } from "../contract/workload-params";
import {
  isActiveKindUniqueViolation,
  isOwnerForeignKeyViolation,
} from "../persistence/constraints";
import { insertWorkload } from "../persistence/queries";

/**
 * The MODE gate + the ROW OWNER (= runner enumeration scope) resolution, server-authoritative:
 *   1. the kind must support the requested mode (else BAD_REQUEST);
 *   2. a bulk run is BOX-OWNER-only (`requireOwner`) — a `null` caller is a trusted system trigger;
 *   3. singular → the caller's own id (or the system `ownerId`); bulk sweep-kind → `null` (all owners); bulk
 *      create-kind → the required `targetOwnerId` (BAD_REQUEST if absent — you can't mint ownerless rows).
 */
function authorizeAndResolveOwner(
  ctx: WorkloadServiceContext,
  params: StartWorkloadParams,
  kind: WorkloadKind,
): UserId | null {
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
    return null; // sweep-kind: every owner
  }
  if (params.targetOwnerId === undefined || params.targetOwnerId === null) {
    throw new DomainOperationError(
      "bulk_target_required",
      `a bulk "${kind}" run must designate a targetOwnerId (it mints owner-owned rows)`,
    );
  }
  return params.targetOwnerId;
}

export function createStart(ctx: WorkloadServiceContext): Pick<WorkloadService, "start"> {
  async function start(params: StartWorkloadParams): Promise<{ id: WorkloadId }> {
    const input = startWorkloadInput.parse(params.input);
    const ownerId = authorizeAndResolveOwner(ctx, params, input.kind);
    const id = ctx.newWorkloadId();
    const now = ctx.now();
    try {
      await insertWorkload(ctx.db, {
        id,
        kind: input.kind,
        mode: params.mode,
        source: resolveWorkloadSource(input.kind, input.params),
        params: input.params as Record<string, unknown>,
        ownerId,
        dependsOn: params.dependsOn ?? null,
        scheduledAt: params.scheduledAt ?? now,
        createdAt: now,
      });
    } catch (err) {
      if (isActiveKindUniqueViolation(err)) {
        // The raw libSQL error carries SQL internals; the typed conflict is the honest signal (the
        // single-active slot is already taken). Chain the cause for diagnostics, don't surface it.
        const conflict = new DomainConflictError(`a "${input.kind}" workload is already active`);
        conflict.cause = err;
        throw conflict;
      }
      if (isOwnerForeignKeyViolation(err)) {
        // The ONLY way the owner FK fails is a bulk-create `targetOwnerId` that isn't a real user (a real
        // caller's own id always exists) — surface it leak-free as "that user isn't found".
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
