// `@orb/contracts/identity` — the global-role axis + the two canonical identity shapes the auth seam
// threads. DAG root: kit-only, no domain, no `@orb/db`, no sibling contracts node.
// Identity resolves ONCE at the entry seam into ONE immutable `Principal` flowing down unchanged;
// `ResolvedIdentity` is the pre-row output (no `userId` — the seam adds it building `Principal`).

import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { z } from "zod";

// The global-authz axis. `owner` = the box owner (sole max-pro-sub/wallet holder; immutable; exactly one);
// `admin` = delegated administrator; `user` = normal. The one home every gating domain derives from.
export const USER_ROLES = ["owner", "admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

// Principal-KIND axis — `human | agent`, orthogonal to `role` (an agent is always `role='user'`, a DDL
// CHECK). A tuple, never an `isAgent` boolean, so it can grow a third flavor without `if`-branching.
// FLAG[PD-17]: AP1 landed (mint + `canAgent`/`AGENT_ACTIONS`/`AgentActor`); AP2/AP3 deferred.
export const USER_KINDS = ["human", "agent"] as const;
export type UserKind = (typeof USER_KINDS)[number];
export const userKindSchema = z.enum(USER_KINDS);

// The `agent_principals.sourceKind` dispatch axis. `buddy` only in v1; a future standalone-agent flavor
// is a tuple member + a speaker-registry arm. FLAG[PD-17]: the speaker-source registry is AP3.
export const AGENT_SOURCE_KINDS = ["buddy"] as const;
export type AgentSourceKind = (typeof AGENT_SOURCE_KINDS)[number];
export const agentSourceKindSchema = z.enum(AGENT_SOURCE_KINDS);

/** The reserved handle namespace for agent principals: `__agent__${sourceKind}__${ownerUserId}` — a
 *  forward-header identity in this namespace must never JIT-create or match an agent row. */
export const RESERVED_AGENT_HANDLE_PREFIX = "__agent__";
/** True when a handle falls in the reserved agent namespace — the auth belts refuse these loudly. */
export function isReservedAgentHandle(handle: string): boolean {
  return handle.startsWith(RESERVED_AGENT_HANDLE_PREFIX);
}

/** The custom CSRF request header. Cross-boundary wire fact: the client sends it every request and the
 *  server gate keys on it. `SameSite=Lax` + this header is the whole CSRF story. */
export const CSRF_HEADER = "x-orb-csrf";

// The SSO mechanism selector; `foundation/env` and `infra/auth`'s `MODE_RESOLVERS` derive from this tuple.
export const AUTH_MODES = ["single-user", "local", "forward-header", "oidc"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];
export const authModeSchema = z.enum(AUTH_MODES);

/** The pre-row output: identity resolved to its stable SSO fields, BEFORE the `users` row exists. Carries
 *  no `userId` by design. `email` is a mutable contact attribute, never an identity/join key — `null`
 *  never wipes a stored email (keep-on-null). */
export interface ResolvedIdentity {
  externalId: ExternalId | null;
  handle: Handle;
  groups: string[];
  email: string | null;
}

/** The post-seam, immutable, db-resolved caller, constructed ONCE and carried downstream unchanged. No
 *  `isOwner` field — owner⊇admin lives only inside the `can()` seam. `via: "fallback"` is the SAFE
 *  "this IS the owner" marker — never infer it from `externalId === null` (a forward-header is also null). */
export interface Principal {
  userId: UserId;
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  via: "cookie" | "header" | "fallback";
}

// The `can()` privilege-decision seam. Cross-boundary: admin's `can()` impl ARBITRATES, chat CALLS IN with
// a roster it loaded; the union homes at the DAG root so both sides import it down. `can()` + the
// `requireAdmin`/`requireOwner` wrappers live in `domain/admin/guard.ts`; chat reaches it by injection.

/** Global-scope authority actions. `admin` = requires an administrator (owner passes too); `owner` =
 *  requires the box owner. */
export const GLOBAL_ACTIONS = ["admin", "owner"] as const;
export type GlobalAction = (typeof GLOBAL_ACTIONS)[number];

/** Chat-resource authority actions. `read` = the present-member floor; `host` = room authority. */
export const CHAT_ACTIONS = ["read", "host"] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

/** A chat participant's room authority. Lives here (not `@orb/contracts/chat`) because `can()` reads it
 *  and identity is the DAG root; chat re-exports this same name, no alias. */
export const PARTICIPANT_ROLES = ["host", "member"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

/** The membership data chat feeds `can()` for a chat-resource decision. `can()` makes the verdict —
 *  chat never compares `role === 'host'` itself. */
export interface ChatRoster {
  readonly role: ParticipantRole;
}

/** GLOBAL scope — the global-role axis (admin/owner). */
export interface GlobalResource {
  readonly kind: "global";
}
/** CHAT scope — carries the {@link ChatRoster} chat loaded + fed in. */
export interface ChatResource {
  readonly kind: "chat";
  readonly roster: ChatRoster;
}
export type ResourceRef = GlobalResource | ChatResource;

/** The ONE privilege-decision primitive: throws `DomainForbiddenError` on deny, void on allow. The
 *  overload couples each action set to its resource kind so a mismatch is a compile error. */
export interface Can {
  (principal: Principal, action: GlobalAction, resource: GlobalResource): void;
  (principal: Principal, action: ChatAction, resource: ChatResource): void;
}

// The agent-principal ceiling: an agent is NEVER a `Principal` (no request path yields one). The ONE
// runtime gate is `canAgent` over the closed `AGENT_ACTIONS` union — an unlisted action is unspellable.

/** The closed allow-union that IS the agent capability ceiling. `speak` = may author a turn it is seated
 *  in; `tool-propose` = may stash a proposal (never execute). */
export const AGENT_ACTIONS = ["speak", "tool-propose"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

/** The actor type for the ONE agent runtime gate (`canAgent`) — not a `Principal`, nothing interconverts
 *  them. `enabled` is the kill switch: a disabled agent fails every `canAgent`. */
export interface AgentActor {
  readonly kind: "agent";
  readonly userId: UserId;
  readonly ownerUserId: UserId;
  readonly enabled: boolean;
}
