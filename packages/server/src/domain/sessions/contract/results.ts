// domain/sessions — verb output shapes (the contract type home, §7.4). These are the three return shapes
// the `entry/auth/seam` assembles the one `Principal` from (sessions.md §"Resolve identity ONCE"):
// `validate` (cookie path) → `ValidatedSession`, `provisionIdentity` (SSO/header path) → `ProvisionResult`,
// `ensureUser` (fallback) → a bare `UserId`. None is a `Principal` itself — the seam adds `via` + mints it.

import type { UserRole } from "@orb/contracts/identity";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";

/** `create` output: the raw token (returned ONCE — never stored; the route sets it as the cookie), the
 *  row id, and the 30-day expiry. */
export interface CreateSessionResult {
  token: string;
  sessionId: SessionId;
  expiresAt: number;
}

/** `validate` output (ledger D40 — Route A): the cookie-resolved caller's principal-fields incl. `userId`.
 *  `role` is RE-READ from the `users` row each request (a role-change propagates next request). `enabled`
 *  is carried for shape-parity with `ProvisionResult` so the seam builds the `Principal` uniformly from
 *  either return; it is ALWAYS `true` on a non-null result, because `validate` GATES disabled rows to
 *  `null` (invariant #8 — disable takes effect on the next request). */
export interface ValidatedSession {
  userId: UserId;
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  enabled: boolean;
}

/** `provisionIdentity` output: the upserted row's id + live login state. The seam gates on `enabled`
 *  (disabled → unauthenticated) and carries `role` into the `Principal`. */
export interface ProvisionResult {
  userId: UserId;
  enabled: boolean;
  role: UserRole;
}

/** `loadUserById` output (PD-73): a bare row id's live principal-fields — the entry root's frozen-host →
 *  `Principal` bridge (D19: the host funds the turn and may be offline, so the role-sensitive ops re-read
 *  the REAL `users.role` instead of fabricating one). NOT a login path: no `enabled` gate rides this read
 *  (the host isn't authenticating; their turn-funding policy is the D17 verbs' concern). */
export interface UserPrincipalFields {
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
}
