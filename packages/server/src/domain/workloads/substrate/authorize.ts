// domain/workloads/substrate/authorize — the F3 per-user authorization predicates the verbs share (one home
// for the ownership/scope logic, so `get`/`cancel`/`retry`/`subscribe`/`list` cannot drift). PURE — no db, no
// I/O; it reads the injected `isAdmin` seam (the sole role-comparison site, D17) + the row's `ownerId`.
//
// The leak-free rule (doctrine): a caller who may NOT see a row is told the SAME thing whether it is missing
// or simply not theirs — the verb collapses both to `DomainNotFoundError` (never a FORBIDDEN existence oracle).

import type { Principal } from "@orb/contracts/identity";
import type { WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import { WORKLOAD_KIND_MODES } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import type { IsAdmin } from "../../admin/contract/guard";

/**
 * Assert a kind supports the requested run mode (the shared MODE-support gate the schedule verbs reuse — the
 * `start` verb keeps its own inline copy so its bulk-target resolution stays one flow). A `singular` request
 * against a bulk-only kind (or vice versa) throws `unsupported_mode` (BAD_REQUEST).
 */
export function assertKindSupportsMode(kind: WorkloadKind, mode: WorkloadMode): void {
  const policy = WORKLOAD_KIND_MODES[kind];
  if ((mode === "singular" && !policy.singular) || (mode === "bulk" && !policy.bulk)) {
    throw new DomainOperationError("unsupported_mode", `"${kind}" does not support ${mode} mode`);
  }
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
