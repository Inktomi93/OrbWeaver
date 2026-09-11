// verb: start — enqueue a `queued` row in a given MODE. Re-parses the input against the OWNING domain's
// contribution schema (defense in depth — the wire validates the envelope only, and mocked-procedure tests
// bypass it entirely). `dependsOn` is persisted here and enforced at dispatch (the DAG scheduler in
// `engine/nextRunnableWorkload`) — start just records the edges. `scheduledAt` is the same shape: a
// caller-supplied future instant is persisted verbatim (absent ⇒ now) and the SAME head query gates on it,
// so a "Run at" row stays out of the dispatch window until its instant.

import type { WorkloadKind } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import { DomainConflictError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { StartWorkloadParams } from "../contract/params.ts";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service.ts";
import { isActiveKindUniqueViolation, isOwnerForeignKeyViolation } from "../persistence/constraints.ts";
import { findActiveAdmittedWorkloadId, insertWorkload } from "../persistence/queries.ts";
import { activeConflictMessage, assertAdmissible, parseWorkloadInput, resolveAdmissionKey } from "../substrate/params.ts";

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

/** The row an admission attempt inserts, minus the id (a retry mints a fresh one). Derived from
 *  `insertWorkload`'s own parameter rather than re-spelled — one shape, one home. */
type AdmissionRow = Omit<Parameters<typeof insertWorkload>[1], "id">;

/**
 * Insert the row — or, when the caller asked to ADOPT and the single-active index refuses, hand back the id
 * of the run already holding the slot.
 *
 * BOUNDED AT TWO ATTEMPTS, and the bound is exact rather than defensive: the only way an attempt can collide
 * AND then find no active row is that the holder reached a terminal state in between, which FREES the slot —
 * so a second insert is the correct next move and cannot be refused for the same reason twice without a new
 * holder existing to be adopted. A conflict with no adoptable row after that is reported as the conflict it
 * is.
 */
async function admit(ctx: WorkloadServiceContext, row: AdmissionRow, adoptActive: boolean): Promise<{ id: WorkloadId }> {
  // @orb-waive caught-failure-ownership(err): the ONE absorbed failure is the single-active
  // collision under an explicit `adoptActive` caller, and it is absorbed by RESOLVING it — the caller gets
  // the id of the run that already holds the slot, which is the outcome it asked for. Every other arm throws
  // the domain's own error (`translateInsertFailure`: conflict / leak-free NOT_FOUND / the raw failure), and
  // the adopt arm that finds no active row retries once and throws that attempt's failure. Ends if any path
  // out of this catch neither returns an admitted workload id nor throws.
  try {
    return await insertOnce(ctx, row);
  } catch (err) {
    // EVERY path out of here throws or returns an admitted row — the failure is never merely noted. A
    // non-adopting caller, and any failure that is not the single-active collision, leaves as the domain's
    // own error (`translateInsertFailure`).
    const adoptable = adoptActive && isActiveKindUniqueViolation(err);
    if (!adoptable) {
      throw translateInsertFailure(err, row);
    }
    const active = await findActiveAdmittedWorkloadId(ctx.db, {
      kind: row.kind,
      mode: row.mode,
      ownerId: row.ownerId,
      admissionKey: row.admissionKey,
    });
    if (active !== undefined) {
      return { id: active };
    }
    // The collision found NO active row, so the holder reached a terminal state between our insert and this
    // look-up — which FREES the slot. One more attempt, and its own failure leaves as the conflict it is.
    try {
      return await insertOnce(ctx, row);
    } catch (retryErr) {
      throw translateInsertFailure(retryErr, row);
    }
  }
}

/** One admission attempt: a freshly minted id (a retry must never reuse one) and the insert. */
async function insertOnce(ctx: WorkloadServiceContext, row: AdmissionRow): Promise<{ id: WorkloadId }> {
  const id = ctx.newWorkloadId();
  await insertWorkload(ctx.db, { ...row, id });
  return { id };
}

/** An insert failure as the domain's own error — the single-active collision becomes the conflict sentence a
 *  person can act on, a missing owner becomes the leak-free NOT_FOUND, anything else travels unchanged. */
function translateInsertFailure(err: unknown, row: AdmissionRow): unknown {
  if (isOwnerForeignKeyViolation(err)) {
    const notFound = new DomainNotFoundError("user", String(row.ownerId));
    notFound.cause = err;
    return notFound;
  }
  return isActiveKindUniqueViolation(err) ? asConflict(err, row.kind) : err;
}

/** The single-active refusal as the domain's own error, carrying the constraint violation as its cause. */
function asConflict(cause: unknown, kind: WorkloadKind): DomainConflictError {
  const conflict = new DomainConflictError(activeConflictMessage(kind));
  conflict.cause = cause;
  return conflict;
}

export function createStart(ctx: WorkloadServiceContext): Pick<WorkloadService, "start"> {
  async function start(params: StartWorkloadParams): Promise<{ id: WorkloadId }> {
    const contributions = ctx.getContributions();
    const input = parseWorkloadInput(contributions, params.input);
    const ownerId = authorizeAndResolveOwner(ctx, params, input.kind);
    // The OWNING DOMAIN's precondition, asked AFTER the owner is resolved (a per-user precondition needs the
    // row's enumeration scope) and BEFORE a row exists (#156): work that structurally cannot produce anything
    // is refused at the door, never enqueued to land as a vacuous success.
    await assertAdmissible(contributions, input.kind, input.params, ownerId);
    const now = ctx.now();
    return await admit(
      ctx,
      {
        kind: input.kind,
        mode: params.mode,
        // The ADMISSION sub-partition — the owning domain's declared concurrency unit (a lane decides WHEN a
        // row runs; this decides WHETHER an identical unit may be enqueued at all).
        admissionKey: resolveAdmissionKey(contributions, input.kind, input.params),
        // The execution lane is the OWNING domain's declaration, stamped here so it survives a restart.
        lane: contributions[input.kind].lane,
        params: input.params as Record<string, unknown>,
        ownerId,
        dependsOn: params.dependsOn ?? null,
        scheduledAt: params.scheduledAt ?? now,
        createdAt: now,
      },
      params.adoptActive === true,
    );
  }
  return { start };
}
