// domain/admin/guard — THE `can()` GUARD SEAM (the unblocker the other domains inject; identity-auth-
// permission §6, admin.md §"Resolved decisions Q1"). This is the ONE place a global role is compared:
// `owner ⊇ admin` lives here and NOWHERE else (no scattered `role === 'admin'`/`'owner'` — spine #6).
//
// PURE — no `Db`, no I/O. Authorization is re-evaluated PER CALL on the immutable `Principal` the caller
// is handed; `role` was resolved ONCE at the entry seam and is fresh per request (sessions' job). The neo
// `requireAdmin(db, userId, role?)` fast/slow-path duality COLLAPSES under the Principal model — the
// principal already carries its role, so there is no `SELECT` and no caller-supplied-role to distrust
// (spine §1). The decision is never cached back onto the Principal.

import type { UserRole } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Can, GlobalAction, RequireAdmin, RequireOwner } from "./contract/guard";

// The role set that satisfies each global action — the SOLE encoding of `owner ⊇ admin`. A mapped Record
// over the action axis (exhaustive: a new `GlobalAction` member fails `tsc` here — no silently-ungated
// action). `owner` satisfies BOTH actions (it is always an administrator, D17); `admin` satisfies only
// `admin`; `user` satisfies neither.
const ROLES_FOR_GLOBAL_ACTION = {
  admin: ["owner", "admin"],
  owner: ["owner"],
} as const satisfies Record<GlobalAction, readonly UserRole[]>;

export const can: Can = (principal, action, _resource) => {
  // `_resource` is GLOBAL-only today (the sole `ResourceRef` arm) — it carries no data the global decision
  // needs, so it is unread. The resource-role arms (chat/character, D18) extend `ResourceRef` and branch
  // on `_resource.kind`; per the contract FLAG they promote to `@orb/contracts` at that point. The
  // gate-relevant axis — `GlobalAction` → role set — IS exhaustively dispatched below (the `as const
  // satisfies Record` makes a new action fail `tsc`).
  const allowed: readonly UserRole[] = ROLES_FOR_GLOBAL_ACTION[action];
  if (!allowed.includes(principal.role)) {
    throw new DomainForbiddenError(`requires ${action} privilege`);
  }
};

export const requireAdmin: RequireAdmin = (principal) => {
  can(principal, "admin", { kind: "global" });
  return principal.userId;
};

export const requireOwner: RequireOwner = (principal) => {
  can(principal, "owner", { kind: "global" });
  return principal.userId;
};
