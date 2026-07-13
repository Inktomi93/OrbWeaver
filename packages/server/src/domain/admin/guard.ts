// The `can()` guard seam — the one place a role/host is compared: `owner ⊇ admin` (global) and
// `role === 'host'` (chat resource-role) live here and nowhere else.
//
// Pure — no `Db`, no I/O. The decision is made over the immutable `Principal` + the resource data the
// caller passes in (chat passes the {@link ChatRoster} it loaded — admin never reads chat's db).
// Authorization is re-evaluated per call; the decision is never cached back onto the Principal.

import type {
  AgentAction,
  AgentActor,
  Can,
  ChatAction,
  ChatRoster,
  GlobalAction,
  Principal,
  ResourceRef,
  UserRole,
} from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { IsAdmin, RequireAdmin, RequireOwner } from "./contract/guard";

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

/** The chat-scope decision — a pure verdict over the roster fed in. Exhaustive over `ChatAction`: a new
 *  action fails tsc at the `never`. */
function decideChat(action: ChatAction, roster: ChatRoster): void {
  switch (action) {
    case "read":
      // Present membership is established by chat's `loadMemberChat` before `can()` is reached. Any present
      // member reads in v1 — this is the seam where a future `observer` participant kind will deny.
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

// The impl param types are the broad unions (the overloaded `Can` couples action↔resource-kind at every
// call site, so the `as` re-narrowing below is sound). Exhaustive over `resource.kind`.
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

/** The agent-principal runtime gate. An agent is a speaker, never a caller (it has no `Principal`), so this
 *  is a new export of the same seam, not a second auth model. Pure verdict: the kill switch (`enabled`) +
 *  the closed-union check. FLAG[PD-17]: landed at AP1; callers inject it via `ChatContext` at AP2. */
export const canAgent = (actor: AgentActor, action: AgentAction, _room: ChatRoster): void => {
  if (!actor.enabled) {
    throw new DomainForbiddenError("agent principal disabled");
  }
  switch (action) {
    case "speak":
      return;
    case "tool-propose":
      return;
    default: {
      const _exhaustive: never = action;
      throw new DomainForbiddenError(`unsupported agent action: ${String(_exhaustive)}`);
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

// The boolean form of the global admin gate — the same `can()` decision, caught into a verdict so a
// role-aware scoping caller can branch without a throw being control flow.
export const isAdmin: IsAdmin = (principal) => {
  try {
    can(principal, "admin", { kind: "global" });
    return true;
  } catch {
    return false;
  }
};
