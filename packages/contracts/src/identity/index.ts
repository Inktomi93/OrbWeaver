// `@orb/contracts/identity` — the global-role axis + the two canonical identity shapes the auth seam
// threads. DAG root: kit-only, no domain, no `@orb/db`, no sibling contracts node.
// Identity resolves ONCE at the entry seam into ONE immutable `Principal` flowing down unchanged;
// `ResolvedIdentity` is the pre-row output (no `userId` — the seam adds it building `Principal`).
//
// VOCABULARY (#1772 / #914, vocabulary-map row 45): `ChatResource.membership` was `ChatResource.roster`
// until 2026-09-06. The TYPE half of row 45 landed at #903 C2 (`ChatRoster` → `ChatMembership`) and left
// the FIELD spelling the old word, so every `can()` call site read `{ kind: "chat", roster: {…} }` for a
// single-`{role}` value that is not a list at all. `roster` remains RESERVED for the saved TEMPLATE
// concept (`rosterPreset`, "Rosters" — row 48) and never names this one.

import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

// The global-authz axis. `owner` = the box owner (sole max-pro-sub/wallet holder; immutable; exactly one);
// `admin` = delegated administrator; `user` = normal. The one home every gating domain derives from.
export const USER_ROLES = ["owner", "admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES) satisfies z.ZodType<UserRole>;

// Principal-KIND axis — currently `human` only (post-rollback: the agent-principal seat wave was purged
// 2026-07-25). A tuple, never an `isAgent` boolean, so it can grow a third flavor without `if`-branching —
// the rebuild grafts an `agent` member here if the agent-principal design set returns (docs/work/0048).
export const USER_KINDS = ["human"] as const;
export type UserKind = (typeof USER_KINDS)[number];
/** @public twin: USER_KINDS — drives the users.kind enum (cross-package PUBLIC). */
export const userKindSchema = z.enum(USER_KINDS) satisfies z.ZodType<UserKind>;

/** The custom CSRF request header. Cross-boundary wire fact: the client sends it every request and the
 *  server gate keys on it. `SameSite=Lax` + this header is the whole CSRF story. */
export const CSRF_HEADER = "x-orb-csrf";

// The SSO mechanism selector; `foundation/env` and `infra/auth`'s `MODE_RESOLVERS` derive from this tuple.
export const AUTH_MODES = ["single-user", "local", "forward-header", "oidc"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];
export const authModeSchema = z.enum(AUTH_MODES) satisfies z.ZodType<AuthMode>;

/** The modes that mint a session cookie, so they need the SESSION_SECRET pepper to authenticate anyone. */
export const COOKIE_AUTH_MODES = ["local", "oidc"] as const satisfies readonly AuthMode[];

export function isCookieAuthMode(mode: AuthMode): boolean {
  return (COOKIE_AUTH_MODES as readonly AuthMode[]).includes(mode);
}

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

/** The canonical viewer identity (`sessions.me`), projected from the request Principal at the transport seam.
 *  A stale client `globalRole` is a UI hint only; server authz always re-reads the live row. STRICT and
 *  installed as the procedure's output parser: a refactor that spreads the Principal would carry `externalId`
 *  (the SSO subject) and `via`, and fails the call instead of reaching the browser. */
export const viewerViewSchema = z.strictObject({
  userId: brandedId<UserId>(),
  handle: brandedId<Handle>(),
  globalRole: userRoleSchema,
});
export type ViewerView = z.infer<typeof viewerViewSchema>;

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
export interface ChatMembership {
  readonly role: ParticipantRole;
}

/** GLOBAL scope — the global-role axis (admin/owner). */
export interface GlobalResource {
  readonly kind: "global";
}
/** CHAT scope — carries the {@link ChatMembership} chat loaded + fed in. */
export interface ChatResource {
  readonly kind: "chat";
  readonly membership: ChatMembership;
}
export type ResourceRef = GlobalResource | ChatResource;

/** The ONE privilege-decision primitive: throws `DomainForbiddenError` on deny, void on allow. The
 *  overload couples each action set to its resource kind so a mismatch is a compile error. */
export interface Can {
  (principal: Principal, action: GlobalAction, resource: GlobalResource): void;
  (principal: Principal, action: ChatAction, resource: ChatResource): void;
}
