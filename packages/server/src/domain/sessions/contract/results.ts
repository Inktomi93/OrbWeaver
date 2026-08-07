// Verb output shapes. These are the three return shapes the entry auth seam assembles the one `Principal`
// from: `validate` → `ValidatedSession`, `provisionIdentity` → `ProvisionResult`, `ensureUser` → a bare
// `UserId`. None is a `Principal` itself — the seam adds `via` and mints it.

import type { UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, SessionId, SessionToken, UserId } from "@orb/kit/ids";

/** `create` output: the raw token (returned ONCE — never stored; the route sets it as the cookie), the
 *  row id, and the 30-day expiry. `token` is the branded `SessionToken` (the opaque cookie VALUE), never
 *  the `SessionId` row id — the brand is what keeps those two from being swapped at the cookie write. */
export interface CreateSessionResult {
  token: SessionToken;
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
export type IdentityAccess = { readonly outcome: "allow"; readonly role: UserRole } | { readonly outcome: "deny" };

/** `provisionIdentity` output — a discriminated union: `provisioned` (the upserted row's live login state)
 *  or `denied` (the login gate refused the identity — no row is created/updated). Distinct from
 *  `enabled:false` (a disabled account, surfaced as 403). */
export type ProvisionResult = { readonly outcome: "provisioned"; userId: UserId; enabled: boolean; role: UserRole } | { readonly outcome: "denied" };

/** `loadUserById` output: a bare row id's live principal-fields — the frozen-host → `Principal` bridge.
 *  The read itself gates NOTHING; it REPORTS `enabled` and each caller decides (the auth seam's REQUEST arm
 *  refuses a disabled row like the cookie/SSO arms do; the frozen-host bridge deliberately does not, so an
 *  offline-or-disabled host's room keeps resolving its authority for the members still in it). */
export interface UserPrincipalFields {
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  /** The row's live login state — a REPORT, not a gate. See the caller split above. */
  enabled: boolean;
}
