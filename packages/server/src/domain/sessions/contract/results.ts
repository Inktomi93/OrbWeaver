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
  /** WHICH session row this cookie is — the identity a per-SESSION action keys on (F4/W7a: logout on the
   *  phone evicts the phone's live sockets and leaves the desktop's alone). It is deliberately NOT part of the
   *  `Principal` the seam mints: D135 keeps the Principal's verdict fields to the ones `users` owns, and a
   *  session is not a role. The seam surfaces it BESIDE the Principal (`SeamResult.sessionId`). */
  sessionId: SessionId;
  userId: UserId;
  role: UserRole;
  handle: Handle;
  externalId: ExternalId | null;
  enabled: boolean;
}

/** What a subject-scoped revoke swept: how many rows flipped, and WHOSE. The userIds are what the entry tier
 *  needs to evict live sockets (W7a) — a stable IdP subject can be bound to more than one row, and the count
 *  alone cannot name them. */
export interface RevokedSessionsSummary {
  readonly revoked: number;
  readonly userIds: readonly UserId[];
}

/** The SSO login access + role decision. `deny` = the allowed-groups login gate refused the identity;
 *  `allow` carries the derived global role. */
export type IdentityAccess = { readonly outcome: "allow"; readonly role: UserRole } | { readonly outcome: "deny" };

/** Why a `provisionIdentity` login was refused. Only `account-exists` (MS-W1 collision hard-deny) needs a
 *  DISTINCT, operator-actionable message; the other refusals collapse to the generic "not authorized". Kept a
 *  single-member union (extensible) rather than enumerating every deny site, so adding a distinct reason is a
 *  local change. */
type ProvisionDenyReason = "account-exists";

/** `provisionIdentity` output — a discriminated union: `provisioned` (the upserted row's live login state)
 *  or `denied` (the login gate refused the identity — no row is created/updated). Distinct from
 *  `enabled:false` (a disabled account, surfaced as 403). `reason` is set only where the callback must emit a
 *  DISTINCT authError (MS-W1 `account-exists`); absent ⇒ the generic not-authorized deny. */
export type ProvisionResult =
  | {
      readonly outcome: "provisioned";
      userId: UserId;
      enabled: boolean;
      role: UserRole;
      /**
       * W7b — did this upsert MOVE a field the viewer's identity reads project (`sessions.me`:
       * handle/globalRole)? The verb reports it because THE CALLER CANNOT KNOW IT: entry hands in a
       * `ResolvedIdentity` and gets back a settled row, with no visibility into whether the handle was
       * renamed or the role re-derived (`RE_DERIVE_ROLE_ON_LOGIN`). The same "report WHO/WHICH, the caller
       * has no way to compute it" shape as `revokeByToken → SessionId | null`.
       *
       * The two entry callers turn a `true` into an `identityChanged` fan on the provisioned user's channel,
       * which is what makes an IdP rename — or a login-time role DEMOTION — reach that human's OTHER live
       * devices. It must stay a REPORTED FACT rather than an unconditional emit at the caller:
       * `entry/auth/seam.ts` calls this on EVERY forward-header request, so an unconditional fan would be a
       * per-request storm on the very plane W8 exists to keep quiet.
       *
       * `false` on a first-login INSERT (nobody is watching a row that did not exist) and on the owner-flip
       * subject BIND (it writes `externalId`/`email`, neither of which any identity read projects).
       */
      readonly identityChanged: boolean;
    }
  | { readonly outcome: "denied"; readonly reason?: ProvisionDenyReason };

/** B5 — `linkExternalId` output. `linked` = the subject was stamped onto the row; `already-linked` = the
 *  row already carried exactly this subject (idempotent no-op); `not-found` = no such row; `target-bound` =
 *  the row is already bound to a DIFFERENT stable subject (bind-once refusal — never rebound); `subject-taken`
 *  = the subject already lives on another row. The admin wrapper maps each to a typed operation code. */
export type LinkExternalIdResult =
  | { readonly outcome: "linked"; readonly userId: UserId }
  | { readonly outcome: "already-linked"; readonly userId: UserId }
  | { readonly outcome: "not-found" }
  | { readonly outcome: "target-bound" }
  | { readonly outcome: "subject-taken" };

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
