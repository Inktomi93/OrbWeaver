// Verb output shapes. These are the three return shapes the entry auth seam assembles the one `Principal`
// from: `validate` → `ValidatedSession`, `provisionIdentity` → `ProvisionResult`, `ensureUser` → a bare
// `UserId`. None is a `Principal` itself — the seam adds `via` and mints it.

import type { UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";

/** `create` output: the raw token (returned ONCE — never stored; the route sets it as the cookie), the
 *  row id, and the 30-day expiry. */
export interface CreateSessionResult {
  token: string;
  sessionId: SessionId;
  expiresAt: number;
}

/** `validate` output: the cookie-resolved caller's principal-fields incl. `userId`. `role` is re-read from
 *  the `users` row each request. `enabled` is always `true` on a non-null result, because `validate` gates
 *  disabled rows to `null`. */
export interface ValidatedSession {
  userId: UserId;
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  enabled: boolean;
}

/** The SSO login access + role decision. `deny` = the allowed-groups login gate refused the identity;
 *  `allow` carries the derived global role. */
export type IdentityAccess =
  | { readonly outcome: "allow"; readonly role: UserRole }
  | { readonly outcome: "deny" };

/** `provisionIdentity` output — a discriminated union: `provisioned` (the upserted row's live login state)
 *  or `denied` (the login gate refused the identity — no row is created/updated). Distinct from
 *  `enabled:false` (a disabled account, surfaced as 403). */
export type ProvisionResult =
  | { readonly outcome: "provisioned"; userId: UserId; enabled: boolean; role: UserRole }
  | { readonly outcome: "denied" };

/** `loadUserById` output: a bare row id's live principal-fields — the frozen-host → `Principal` bridge. Not
 *  a login path: no `enabled` gate rides this read. */
export interface UserPrincipalFields {
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
}

/** `provisionAgentPrincipal` output: the agent's `users` id + whether this call minted it (`false` = the
 *  idempotent re-call, or the race loser, found the existing row). */
export interface ProvisionAgentResult {
  agentUserId: UserId;
  created: boolean;
}
