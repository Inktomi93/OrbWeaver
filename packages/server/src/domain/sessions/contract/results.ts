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

/**
 * #141 — what a LOGOUT ended: which session row, and the OIDC end-session hint that row was carrying.
 *
 * `sessionId` is the W7a socket-eviction key (unchanged — the caller holds a token, and a token is not an
 * identity, so only the row can name it). `oidcIdToken` is the DECRYPTED `id_token`, present only when this
 * session was minted by the OIDC callback AND the blob still opened; `null` covers a local/first-run login,
 * a pre-#141 row, and a decrypt failure (a rotated `SESSION_SECRET`), and the route then sends the bare
 * end-session URL. It is a SECRET IN FLIGHT: the logout route puts it in the outbound end-session URL and
 * nowhere else — never a log field, never a response body, never a `SessionView`.
 */
export interface RevokedSession {
  readonly sessionId: SessionId;
  readonly oidcIdToken: string | null;
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

/** The live `users` fields the provision decision reads off a matched row. */
export interface ProvisionCandidate {
  readonly id: UserId;
  readonly handle: Handle;
  readonly externalId: ExternalId | null;
  readonly email: string | null;
  readonly role: UserRole;
  readonly enabled: boolean;
}

/** Which ruled refusal `decideProvision` reached. The verb maps each to its log line and its `ProvisionResult`. */
const PROVISION_DENY_CAUSES = ["subject-mismatch", "access-gate", "handle-collision", "jit-closed"] as const;
export type ProvisionDenyCause = (typeof PROVISION_DENY_CAUSES)[number];

/** A refusal: no row is created or updated. */
export interface ProvisionDeny {
  readonly kind: "deny";
  readonly cause: ProvisionDenyCause;
}

/** Write a brand-new row. `ownerSingletonDowngrade` reports that the owner policy matched while another owner
 *  exists, so `resolvedRole` fell to `user`. */
export interface ProvisionInsert {
  readonly kind: "insert";
  readonly resolvedRole: UserRole;
  readonly enabled: boolean;
  readonly ownerSingletonDowngrade: boolean;
}

/** Refresh the matched row. `isBootstrapOwner` pins the owner's role and seed handle (see `updateExisting`). */
export interface ProvisionUpdate {
  readonly kind: "update";
  readonly existing: ProvisionCandidate;
  readonly resolvedRole: UserRole;
  readonly isBootstrapOwner: boolean;
  readonly ownerSingletonDowngrade: boolean;
}

/**
 * The pure provision decision (D254, spine invariant 10). Two arms name a read the decision cannot make and
 * the step that follows it: `adopt-unbound-owner` binds the subject onto the owner row when that row is still
 * unbound, else runs `otherwise`; `require-free-email` refuses `account-exists` when another row carries the
 * email, else runs `otherwise`. The verb runs those reads; a batch statement carries them in SQL.
 */
export type ProvisionDecision =
  | ProvisionDeny
  | ProvisionInsert
  | ProvisionUpdate
  | {
      readonly kind: "adopt-unbound-owner";
      readonly ownerId: UserId;
      readonly externalId: ExternalId;
      readonly otherwise: ProvisionInsert | ProvisionUpdate;
    }
  | { readonly kind: "require-free-email"; readonly email: string; readonly otherwise: ProvisionInsert | ProvisionDeny };

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

/** B5 — why a link claim bound NOTHING, read from settled durable state after the fact
 *  ({@link SessionsService.settleUnclaimedLink}). `already-linked` = the row already carried exactly this
 *  subject (idempotent no-op); `not-found` = no such row; `target-bound` = the row is already bound to a
 *  DIFFERENT stable subject (bind-once refusal — never rebound); `subject-taken` = the subject already lives
 *  on another row. The admin wrapper maps each to a typed operation code.
 *
 *  THERE IS NO `linked` ARM, and that is the shape of the #1707 seam rather than an omission: the bind is an
 *  UNEXECUTED statement its caller commits inside its own audited batch, so a successful bind is reported by
 *  that statement's own non-empty `RETURNING` — no settlement read is involved, and a "linked" value nothing
 *  could ever hold would be residue. */
export type UnclaimedLinkOutcome =
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
