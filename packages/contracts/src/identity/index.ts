// `@orb/contracts/identity` — the ONE global-role axis + the two canonical identity shapes the auth
// seam threads (spine `identity-auth-permission.md` §1). DAG root: kit-only (the `UserId`/`Handle`/
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

// The ONE auth-mode axis — the SSO mechanism selector. The single tuple is the one home (§7.5,
// string-union-dispatch.md §125 names `authMode`): `foundation/env` derives `z.enum(AUTH_MODES)` for the
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

/** The chat resource-role of the permission model (the D18 `host|member` axis as the `can()` resource role).
 *  Identity is the DAG root, so it cannot import `@orb/contracts/chat`'s `PARTICIPANT_ROLES`; this is the
 *  permission-contract home of the same two-member axis (the chat `chat_participants.role` column MIRRORS it,
 *  structurally identical — chat feeds its `ParticipantRole` straight into a {@link ChatRoster} with no cast).
 *  FLAG[PD-59]: derive chat's `PARTICIPANT_ROLES` FROM this tuple (one home) when chat's contract may depend
 *  on identity — out of scope for the PD-1 relocation (would touch `@orb/contracts/chat`). */
export const CHAT_RESOURCE_ROLES = ["host", "member"] as const;
export type ChatResourceRole = (typeof CHAT_RESOURCE_ROLES)[number];

/** The membership data chat FEEDS `can()` for a chat-resource decision: the caller's resolved present-
 *  membership (loaded via chat's `loadMemberChat` — no extra query; the turn loads it anyway). `can()` makes
 *  the verdict over this data — chat NEVER compares `role === 'host'` itself (spine invariant #6). */
export interface ChatRoster {
  readonly role: ChatResourceRole;
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
