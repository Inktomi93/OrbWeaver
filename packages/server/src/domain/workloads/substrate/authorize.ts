// domain/workloads/substrate/authorize — the F3 per-user authorization predicates the verbs share (one home
// for the ownership/scope logic, so `get`/`cancel`/`retry`/`subscribe`/`list` cannot drift). No db of its own: it
// reads the injected `isAdmin`/`isOwner`/`requireOwner`/`isBoxOwner` seams, which decide through the `can()` kernel
// (D17), and the row's `ownerId` and `funderUserId`.
//
// SEEING IS NOT ACTING (D17). An admin sees every owner's rows (`isVisibleToCaller`, `resolveListOwnerFilter`), but
// admin is delegated authority that does not reach the box owner's own work: only the box owner cancels, retries,
// retunes, pauses or deletes a run or schedule the box owner owns or funds (`mayActOnRow`). Any caller still acts on
// its own rows, and an admin still acts on a member's.
//
// The leak-free rule (doctrine): a caller who may NOT see a row is told the SAME thing whether it is missing
// or simply not theirs — the verb collapses both to `DomainNotFoundError` (never a FORBIDDEN existence oracle). A
// row the caller sees but may not act on is answered the same way, as `canCloneRow` already answers a bulk row.

import type { IsAdmin, RequireOwner } from "@orb/contracts/admin";
import type { Principal } from "@orb/contracts/identity";
import type { StartWorkloadParams, WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { WorkloadServiceContext } from "../contract/service.ts";
import type { WorkloadReadAccess } from "../contract/workload-row.ts";

/**
 * Assert a kind supports the requested run mode (the shared MODE-support gate `start`, the call estimate and the
 * schedule verbs reuse). A `singular` request against a bulk-only kind (or vice versa) throws `unsupported_mode`
 * (BAD_REQUEST).
 */
export function assertKindSupportsMode(kind: WorkloadKind, mode: WorkloadMode): void {
  const policy = WORKLOAD_KIND_MODES[kind];
  if ((mode === "singular" && !policy.singular) || (mode === "bulk" && !policy.bulk)) {
    throw new DomainOperationError("unsupported_mode", `"${kind}" does not support ${mode} mode`);
  }
}

/**
 * The MODE gate + the ROW OWNER (= runner enumeration scope) resolution, server-authoritative, shared by `start`
 * and the call estimate so an estimate always counts the scope the run would enumerate:
 *   1. the kind must support the requested mode (else BAD_REQUEST);
 *   2. a bulk run is BOX-OWNER-only (`requireOwner`) — a `null` caller is a trusted system trigger;
 *   3. singular → the caller's own id (or the system `ownerId`); bulk sweep-kind → `null` (all owners); bulk
 *      create-kind → the required `targetOwnerId` (BAD_REQUEST if absent — you can't mint ownerless rows).
 */
export function resolveRunOwner(
  requireOwner: RequireOwner,
  params: Pick<StartWorkloadParams, "caller" | "mode" | "ownerId" | "targetOwnerId">,
  kind: WorkloadKind,
): UserId | null {
  assertKindSupportsMode(kind, params.mode);
  if (params.mode === "singular") {
    return params.caller !== null ? params.caller.userId : params.ownerId;
  }
  if (params.caller !== null) {
    requireOwner(params.caller);
  }
  if (!WORKLOAD_KIND_MODES[kind].bulkRequiresTarget) {
    return null;
  }
  if (params.targetOwnerId === undefined || params.targetOwnerId === null) {
    throw new DomainOperationError("bulk_target_required", `a bulk "${kind}" run must designate a targetOwnerId (it mints owner-owned rows)`);
  }
  return params.targetOwnerId;
}

/**
 * May `caller` see a row owned by `ownerId`? A `null` caller is a TRUSTED system/scheduler trigger
 * (unrestricted). An admin (owner∪admin, via the injected seam) sees every owner. Otherwise a caller sees
 * ONLY rows it owns (`row.ownerId === caller.userId`) — a `null`-owned system row is never a user's. A verb that
 * changes the row also asks {@link mayActOnRow}.
 */
export function isVisibleToCaller(isAdmin: IsAdmin, caller: Principal | null, ownerId: UserId | null): boolean {
  if (caller === null) {
    return true;
  }
  if (isAdmin(caller)) {
    return true;
  }
  return ownerId !== null && ownerId === caller.userId;
}

/**
 * May `caller` act on a row {@link isVisibleToCaller} already admitted: cancel, retry or estimate a retry of a run, or
 * retune, pause or delete a schedule? A row the box owner owns or funds is the box owner's work, and a delegated admin
 * may not act on it (D17). A caller always acts on its own row, and a `null` caller is a trusted system trigger.
 * A bulk row has no owner of its own or names its target; its funder is the box owner who started it.
 */
export async function mayActOnRow(
  seams: Pick<WorkloadServiceContext, "isOwner" | "isBoxOwner">,
  caller: Principal | null,
  row: { readonly ownerId: UserId | null; readonly funderUserId?: UserId | null },
): Promise<boolean> {
  if (caller === null || row.ownerId === caller.userId || seams.isOwner(caller)) {
    return true;
  }
  const accounts = [row.ownerId, row.funderUserId ?? null].filter((account): account is UserId => account !== null);
  const ownersWork = await Promise.all(accounts.map(async (account) => await seams.isBoxOwner(account)));
  return !ownersWork.includes(true);
}

/**
 * May `caller` clone this row (`retry`) or ask what cloning it would cost? The row must be visible to them, and a
 * BULK row is the box owner's alone. An admin who is not the box owner is therefore answered exactly as a caller
 * who cannot see the row, so the refusal is no oracle for whether a bulk row exists.
 * A deleted owner leaves an audit-only row; cloning must never turn it into system work.
 */
export function canCloneRow(seams: Pick<WorkloadServiceContext, "isAdmin" | "isOwner">, caller: Principal | null, row: WorkloadReadAccess): boolean {
  return (
    !(row.ownerId === null && !row.admissionSystem) &&
    isVisibleToCaller(seams.isAdmin, caller, row.ownerId) &&
    (caller === null || row.mode !== "bulk" || seams.isOwner(caller))
  );
}

/**
 * The effective owner filter for a `list` — the server-authoritative scope. A non-admin caller is FORCED to
 * its own `userId` (any client-supplied `ownerId` is ignored — a user can only ever list its own workloads).
 * A `null` system caller or an admin keeps the requested filter (`requestedOwnerId`), so an admin gets the
 * deployment-wide view (undefined = all owners) or can narrow to one owner.
 */
export function resolveListOwnerFilter(isAdmin: IsAdmin, caller: Principal | null, requestedOwnerId: UserId | null | undefined): UserId | null | undefined {
  if (caller !== null && !isAdmin(caller)) {
    return caller.userId;
  }
  return requestedOwnerId;
}
