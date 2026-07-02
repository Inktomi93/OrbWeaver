// `@orb/contracts/identity` — the ONE global-role axis + the two canonical identity shapes the auth
// seam threads (spine `Spine-Identity-and-Auth.md` §1). DAG root: kit-only (the `UserId`/`Handle`/
// `ExternalId` brands from `@orb/kit/ids`) + zod. No domain, no `@orb/db`, no sibling contracts node.
//
// Identity is resolved ONCE at the entry seam into ONE immutable `Principal` that flows down unchanged;
// `ResolvedIdentity` is the pre-row VERIFICATION-tier output (NO `userId` by design — invariant #3),
// and the seam mints `Principal` from it once at `entry/auth/seam.ts`.

import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { z } from "zod";

// The ONE global-authz axis — owner|admin|user (ledger D17; was the 2-member admin|user). The `owner`
// member is NEW: owner = the box owner (sole max-pro-sub/wallet holder; grants/revokes admin; immutable;
// EXACTLY ONE), admin = delegated administrator (NOT the box owner), user = normal. The single tuple is
// the one home (§7.4): the db `users.role` enum, the tRPC `z.enum`, the client form, and every gating
// domain DERIVE from it (no inline role-union re-spelling — `no-inline-union-redecl`).
export const USER_ROLES = ["owner", "admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];
/** The wire schema for the role axis — `z.enum` over the canonical tuple (consumed by tRPC + forms). */
export const userRoleSchema = z.enum(USER_ROLES);

// The ONE principal-KIND axis (D60; agent-principal-design/01 §1) — `human | agent`. Orthogonal to `role`
// (the human privilege axis): an agent is ALWAYS `role='user'` (a DDL CHECK, agent-principal-design/01 §1).
// A tuple, never an `isAgent` boolean — a boolean can't grow to a third flavor and forces `if`-branching
// instead of exhaustive dispatch (§7.5). The one home: `@orb/db`'s `users.kind` enum + a CHECK derive from
// it (the `USER_ROLES` precedent; a db↔contracts mirror test pins them equal).
// FLAG[PD-17]: the KIND axis is born at AP0 (schema + this tuple). The behavior it unlocks lands in waves:
// AP1 (HERE NOW) = the mint (`provisionAgentPrincipal`) + `canAgent`/`AGENT_ACTIONS` + `AgentActor` (below) +
// the admin/notifications/invite refusals; AP2 = attribution + the `AI_DRIVEN_KINDS`/`USER_BACKED_KINDS`
// kind-sets (deferred — their arbitration/predicate consumers flip there); AP3 = `chat.seatAgent` + the
// speaker-source registry + `AgentSpeakerIdentity` (deferred). Each wave adds vocab WITH its consumer, never
// as a dead branch (Orbweaver credo).
export const USER_KINDS = ["human", "agent"] as const;
export type UserKind = (typeof USER_KINDS)[number];
/** The wire schema for the principal-kind axis — `z.enum` over the canonical tuple (the `userRoleSchema` twin). */
export const userKindSchema = z.enum(USER_KINDS);

// WHAT kind of agent a principal is — the `agent_principals.sourceKind` dispatch axis (agent-principal-design/01
// §2). `buddy` only in v1; a future standalone-agent flavor is a tuple member + a speaker-registry arm (AP3).
// FLAG[PD-17]: born as the satellite's enum at AP0; the speaker-source registry that dispatches on it is AP3.
export const AGENT_SOURCE_KINDS = ["buddy"] as const;
export type AgentSourceKind = (typeof AGENT_SOURCE_KINDS)[number];
/** The wire schema for the agent-source axis — `z.enum` over the canonical tuple. */
export const agentSourceKindSchema = z.enum(AGENT_SOURCE_KINDS);

/** The reserved handle namespace for agent principals (agent-principal-design/01 §3/§4). An agent's handle is
 *  the deterministic `__agent__${sourceKind}__${ownerUserId}` — the idempotency key AND the namespace the
 *  auth belts REFUSE (a forward-header `X-User: __agent__…` must never JIT-create or match an agent row). The
 *  `__group__` synthetic-character precedent reserves a namespace the same way, but characters never reached
 *  auth — THIS refusal is new and load-bearing (agent-principal-design/01 §3.2). */
export const RESERVED_AGENT_HANDLE_PREFIX = "__agent__";
/** True when a handle falls in the reserved agent namespace — the auth belts (`sessions.ensureUser`/
 *  `provisionIdentity`) refuse these loudly, never JIT-create or match against them. */
export function isReservedAgentHandle(handle: string): boolean {
  return handle.startsWith(RESERVED_AGENT_HANDLE_PREFIX);
}

// The ONE auth-mode axis — the SSO mechanism selector. The single tuple is the one home (§7.5,
// Spine-TypeScript-and-Patterns.md §125 names `authMode`): `foundation/env` derives `z.enum(AUTH_MODES)` for the
// `AUTH_MODE` var + its superRefine, and `infra/auth`'s `AuthConfig.mode` + the `MODE_RESOLVERS` dispatch
// DERIVE from it — no inline re-spell anywhere.
export const AUTH_MODES = ["single-user", "local", "forward-header", "oidc"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];
/** The env/wire schema for the auth-mode axis — `z.enum` over the canonical tuple. */
export const authModeSchema = z.enum(AUTH_MODES);

/**
 * The VERIFICATION-tier output (`infra/auth`, sealed + db-free): identity resolved to its stable SSO
 * fields, BEFORE the `users` row exists. Carries NO `userId` by design (invariant #3 — infra must not
 * know row ids; the seam adds it when building `Principal`). `externalId` is the stable authentik
 * sub/uid (null for the single-user / owner-fallback path, which keys on `handle`); `groups` drives the
 * owner/admin role determination at the resolution tier.
 */
export interface ResolvedIdentity {
  externalId: ExternalId | null;
  handle: Handle;
  groups: string[];
}

/**
 * The post-seam, immutable, db-resolved caller — constructed ONCE at `entry/auth/seam.ts` and carried
 * downstream unchanged. `role` is the SOLE carried authz axis (no `groups`: SSO groups are consumed
 * into `role` at login — ledger §2). The CALLER is just `Principal.userId` (D19 — there is NO separate
 * `callerUserId` term, and NO `isOwner` field: owner⊇admin lives only inside the `can()` seam). The
 * turn concepts `triggeredBy`/`runAsUserId` are NOT on the Principal — they are per-turn ids.
 * `via` is the resolution-path discriminant: `"fallback"` is the SAFE "this IS the owner" marker (the
 * origin-gated belt) — NEVER `externalId === null` (a forward-header identity is also null).
 */
export interface Principal {
  userId: UserId;
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  via: "cookie" | "header" | "fallback";
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE `can()` PRIVILEGE-DECISION SEAM (spine §6 RESOLVED + §4 LOCKED interface).
// Promoted here from `domain/admin/contract/guard.ts` at PD-1 (chat wired the `host|member` resource axis in
// P5). The types are CROSS-BOUNDARY: admin's `can()` impl ARBITRATES, and chat (a sibling domain that cannot
// write admin's contract — `domain-no-cross-feature`) CALLS IN with a roster it loaded. So the union homes at
// the DAG root (`@orb/contracts/identity`, kit-only) where BOTH sides import it DOWN. The runtime `can()` +
// the `requireAdmin`/`requireOwner` wrappers still live in `domain/admin/guard.ts`; chat reaches `can` by
// INJECTION (`ChatContext.can`), never by importing admin.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// The action vocab is split BY resource kind — each axis is one canonical tuple (derive-don't-respell, §7.5);
// the `Can` overload (below) couples each action set to its resource kind so a mismatch is a compile error.

/** Global-scope authority actions. `admin` = "requires an administrator" (owner ∪ admin pass — owner ⊇ admin
 *  lives ONLY inside the seam); `owner` = "requires the box owner" (owner-only). */
export const GLOBAL_ACTIONS = ["admin", "owner"] as const;
export type GlobalAction = (typeof GLOBAL_ACTIONS)[number];

/** Chat-resource authority actions (the D18 resource-role axis). `read` = the present-member floor
 *  (stream/post/run-a-turn); `host` = room authority (config/roster/lifecycle). The DECISION over these lives
 *  in `can()`; chat only loads the roster + maps the verdict to its leak-free/coded error surface. */
export const CHAT_ACTIONS = ["read", "host"] as const;
export type ChatAction = (typeof CHAT_ACTIONS)[number];

/** A chat participant's room authority — the D18 `host|member` axis (`host` = the ONE `requireHost` +
 *  `runAsUserId`/funding source; `member` = everyone else). THE ONE HOME (PD-59): it lives here because
 *  `can()` reads it and identity is the DAG root (it cannot import `@orb/contracts/chat`); `@orb/contracts/chat`
 *  RE-EXPORTS this same name (its `chat_participants.role` column + the wire roster use it directly — no
 *  second name, no alias). */
export const PARTICIPANT_ROLES = ["host", "member"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

/** The membership data chat FEEDS `can()` for a chat-resource decision: the caller's resolved present-
 *  membership (loaded via chat's `loadMemberChat` — no extra query; the turn loads it anyway). `can()` makes
 *  the verdict over this data — chat NEVER compares `role === 'host'` itself (spine invariant #6). */
export interface ChatRoster {
  readonly role: ParticipantRole;
}

/** GLOBAL scope — the global-role axis (admin/owner). */
export interface GlobalResource {
  readonly kind: "global";
}
/** CHAT scope — the D18 resource-role axis; carries the {@link ChatRoster} chat loaded + fed in. */
export interface ChatResource {
  readonly kind: "chat";
  readonly roster: ChatRoster;
}
/** The resource a privilege decision is scoped to. A NEW arm (e.g. `{kind:'character', …}`) breaks the
 *  `can()` impl's exhaustive `switch` until handled (born-compliant exhaustiveness). */
export type ResourceRef = GlobalResource | ChatResource;

/** The ONE privilege-decision primitive: throws `DomainForbiddenError` on deny, returns void on allow. Every
 *  gate routes through this — the only role/host-comparison site in the codebase (spine invariant #6). The
 *  overload COUPLES each action set to its resource kind: `can(p,'host',{kind:'global'})` is a compile error
 *  (and vice-versa), so an action can never be paired with the wrong resource. */
export interface Can {
  (principal: Principal, action: GlobalAction, resource: GlobalResource): void;
  (principal: Principal, action: ChatAction, resource: ChatResource): void;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE AGENT-PRINCIPAL CEILING (D60; agent-principal-design/03). An agent is NEVER a `Principal` (wall one —
// no request path yields one; `Principal` has no `kind` field). The ONE runtime gate is `canAgent` on the
// same `domain/admin/guard.ts` seam, over the closed `AGENT_ACTIONS` union — an action not listed here is
// UNSPELLABLE (the ceiling IS the union; growing it is a tuple member + a ledger call). Landed at AP1 with
// its `canAgent` consumer (deferred from AP0 per no-dead-branches). `AgentSpeakerIdentity` stays AP3.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The closed allow-union that IS the agent capability ceiling (agent-principal-design/03 §2). `speak` = may
 *  author a turn in a room it is seated in; `tool-propose` = may STASH a proposal during an agent-mode turn
 *  (never execute — `confirm` is a human `Principal` verb, structurally out of reach). No `z.enum` companion:
 *  this is a runtime-only ceiling (no db/wire consumer derives it — unlike `USER_ROLES`/`USER_KINDS`). */
export const AGENT_ACTIONS = ["speak", "tool-propose"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

/** The actor type for the ONE agent runtime gate (`canAgent`) — NOT a `Principal`, and nothing interconverts
 *  them (no constructor, no cast site — compile-level separation; agent-principal-design/03 §1). The engine
 *  builds it from the roster row + the joined `users` row (`ownerUserId`/`enabled`) when it runs an agent
 *  speaker's turn. `enabled` is the kill switch — a disabled agent fails every `canAgent`. */
export interface AgentActor {
  readonly kind: "agent";
  readonly userId: UserId;
  readonly ownerUserId: UserId;
  readonly enabled: boolean;
}
