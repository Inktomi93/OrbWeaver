// domain/workloads/substrate/authorize — the F3 per-user authorization predicates the verbs share (one home
// for the ownership/scope logic, so `get`/`cancel`/`retry`/`subscribe`/`list` cannot drift). PURE — no db, no
// I/O; it reads the injected `isAdmin`/`requireOwner` seams (the sole role-comparison sites, D17) + the row's `ownerId`.
//
// The leak-free rule (doctrine): a caller who may NOT see a row is told the SAME thing whether it is missing
// or simply not theirs — the verb collapses both to `DomainNotFoundError` (never a FORBIDDEN existence oracle).

import type { Principal } from "@orb/contracts/identity";
import type { WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { IsAdmin, RequireOwner } from "#domain/admin";
import type { StartWorkloadParams } from "../contract/params.ts";

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
 * May `caller` see/act on a row owned by `ownerId`? A `null` caller is a TRUSTED system/scheduler trigger
 * (unrestricted). An admin (owner∪admin, via the injected seam) sees every owner. Otherwise a caller sees
 * ONLY rows it owns (`row.ownerId === caller.userId`) — a `null`-owned system row is never a user's.
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
