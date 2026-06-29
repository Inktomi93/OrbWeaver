// domain/admin/guard — THE `can()` GUARD SEAM (the unblocker the other domains inject; identity-auth-
// permission §6, admin.md §"Resolved decisions Q1"). This is the ONE place a role/host is compared: `owner ⊇
// admin` (global) and `role === 'host'` (chat resource-role) live HERE and NOWHERE else (no scattered
// `role === 'admin'`/`'owner'` in the gating domains, no `role === 'host'` in chat — spine #6).
//
// PURE — no `Db`, no I/O. The decision is made over the immutable `Principal` + the resource DATA the caller
// passes in (global needs none; chat passes the {@link ChatRoster} it loaded — admin NEVER reads chat's db,
// `domain-no-cross-feature`). Authorization is re-evaluated PER CALL; `role` was resolved ONCE at the entry
// seam and is fresh per request (sessions' job). The decision is never cached back onto the Principal.

import type {
  Can,
  ChatAction,
  ChatRoster,
  GlobalAction,
  Principal,
  ResourceRef,
  UserRole,
} from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { RequireAdmin, RequireOwner } from "./contract/guard";

// The role set that satisfies each global action — the SOLE encoding of `owner ⊇ admin`. A mapped Record over
// the action axis (exhaustive: a new `GlobalAction` member fails `tsc` here — no silently-ungated action).
// `owner` satisfies BOTH actions (it is always an administrator, D17); `admin` satisfies only `admin`; `user`
// satisfies neither.
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

/** The CHAT-scope decision (the D18 resource-role axis) — a PURE verdict over the roster chat fed in (the
 *  caller's resolved membership; admin reads NO chat db, takes no `principal` beyond it). Exhaustive over
 *  `ChatAction`: a new action fails `tsc` at the `never`. */
function decideChat(action: ChatAction, roster: ChatRoster): void {
  switch (action) {
    case "read":
      // Present membership is established by chat's `loadMemberChat` BEFORE `can()` is reached (a non-member
      // raises chat's leak-free not-found and never gets here). Any present member reads in v1 — this is the
      // seam where a future `observer` participant kind will deny. So: allow.
      return;
    case "host":
      if (roster.role !== "host") {
        throw new DomainForbiddenError("requires the room host");
      }
      return;
    default: {
      const _exhaustive: never = action;
      throw new DomainForbiddenError(`unsupported chat action: ${String(_exhaustive)}`);
    }
  }
}

// The impl param types are the BROAD unions (the overloaded `Can` couples action↔resource-kind at every CALL
// site, so the `as` re-narrowing below is sound — `tsc` has already proven the pairing). Exhaustive over
// `resource.kind`: a new `ResourceRef` arm fails `tsc` at the `never` (born-compliant).
export const can: Can = (
  principal: Principal,
  action: GlobalAction | ChatAction,
  resource: ResourceRef,
): void => {
  switch (resource.kind) {
    case "global":
      decideGlobal(principal, action as GlobalAction);
      return;
    case "chat":
      decideChat(action as ChatAction, resource.roster);
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
