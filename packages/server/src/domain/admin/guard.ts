// The `can()` guard seam — the one place a role/host is compared: `owner ⊇ admin` (global) and
// `role === 'host'` (chat resource-role) live here and nowhere else.
//
// Pure — no `Db`, no I/O. The decision is made over the immutable `Principal` + the resource data the
// caller passes in (chat passes the {@link ChatMembership} it loaded — admin never reads chat's db).
// Authorization is re-evaluated per call; the decision is never cached back onto the Principal.

import type { Can, ChatAction, ChatMembership, GlobalAction, Principal, ResourceRef, UserRole } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { IsAdmin, IsOwner, RequireAdmin, RequireOwner } from "./contract/guard.ts";

// The role set that satisfies each global action — the sole encoding of `owner ⊇ admin`. Exhaustive: a new
// `GlobalAction` member fails tsc here.
const ROLES_FOR_GLOBAL_ACTION = {
  admin: ["owner", "admin"],
  owner: ["owner"],
} as const satisfies Record<GlobalAction, readonly UserRole[]>;

/** The GLOBAL-scope decision (the global-role axis). Throws on deny. */
function decideGlobal(principal: Principal, action: GlobalAction): void {
  if (!ROLES_FOR_GLOBAL_ACTION[action].includes(principal.role)) {
    throw new DomainForbiddenError(`requires ${action} privilege`);
  }
}

/** The chat-scope decision — a pure verdict over the membership fed in. Exhaustive over `ChatAction`: a new
 *  action fails tsc at the `never`. */
function decideChat(action: ChatAction, membership: ChatMembership): void {
  switch (action) {
    case "read":
      // Present membership is established by chat's `loadMemberChat` before `can()` is reached. Any present
      // member reads in v1 — this is the seam where a future `observer` participant kind will deny.
      return;
    case "host":
      if (membership.role !== "host") {
        throw new DomainForbiddenError("requires the room host");
      }
      return;
    default: {
      const _exhaustive: never = action;
      throw new DomainForbiddenError(`unsupported chat action: ${String(_exhaustive)}`);
    }
  }
}

// The impl param types are the broad unions (the overloaded `Can` couples action↔resource-kind at every
// call site, so the `as` re-narrowing below is sound). Exhaustive over `resource.kind`.
export const can: Can = (principal: Principal, action: GlobalAction | ChatAction, resource: ResourceRef): void => {
  switch (resource.kind) {
    case "global":
      decideGlobal(principal, action as GlobalAction);
      return;
    case "chat":
      decideChat(action as ChatAction, resource.membership);
      return;
    default: {
      const _exhaustive: never = resource;
      throw new DomainForbiddenError(`unsupported resource: ${JSON.stringify(_exhaustive)}`);
    }
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

// The boolean form of a GLOBAL gate — the same `can()` decision, caught into a verdict so a caller that
// must branch (rather than throw) can ask it. ONE catch serves both exported gates below: a second copy
// would be a second place the role ladder could be mis-spelled, which is what this file exists to prevent.
function allowsGlobal(principal: Principal, action: GlobalAction): boolean {
  // @orb-waive caught-failure-ownership(catch): FAIL-CLOSED — the ONE `can()` kernel's refusal
  // collapses to a boolean verdict for a role-aware caller; a denied `can()` can never read as allowed.
  // Ends if `can()` grows a distinct infra-error class this boolean must stop swallowing.
  try {
    can(principal, action, { kind: "global" });
    return true;
  } catch {
    return false;
  }
}

/** owner ∪ admin, as a verdict — for role-aware SCOPING (workloads widens a listing for an admin). */
export const isAdmin: IsAdmin = (principal) => allowsGlobal(principal, "admin");

/**
 * OWNER-only, as a verdict. Its consumer is `entry/auth/seam.ts::debugGateAdmits` — the /api/_debug
 * admission arm, which cannot throw (it short-circuits a hono middleware's token check).
 *
 * WHY THAT DOOR IS OWNER AND NOT `isAdmin` (D17): behind it sit principal-BLIND whole-deployment reads —
 * any room's message content, every user's config rows, and the provider wire-capture ring (the literal
 * assembled prompt of every user's turn, plus the model's reply bytes under `WIRE_CAPTURE_REPLY`). D17 makes
 * `owner` the single box holder and `admin` DELEGATED in-app authority that cannot reach owner-only
 * resources, and it puts an actor's inference connections under the principal who configured them with no
 * owner credential inherited by another principal. Box diagnostics are the owner's, not a delegate's.
 */
export const isOwner: IsOwner = (principal) => allowsGlobal(principal, "owner");
