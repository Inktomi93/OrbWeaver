// domain/sessions — verb input shapes (the contract is the one home for the domain's types, §7.4).
// `provisionIdentity` takes the cross-boundary `ResolvedIdentity` directly (its `{ externalId, handle,
// groups }` shape IS the SSO upsert input — re-spelling it as a separate `ProvisionInput` would double a
// type that already has a canonical home in `@orb/contracts/identity`, violating one-home/no-doubling).
// `ensureUser`/`revoke`/`list` take bare branded ids/strings — no wrapper needed.

import type { UserId } from "@orb/kit/ids";

/** `create` input: the resolved owner of the new session + the UA captured at mint (null when absent). */
export interface CreateSessionParams {
  userId: UserId;
  userAgent?: string | null;
  /**
   * #141 — the RAW OIDC `id_token` from the code exchange, for ONE downstream use: the `id_token_hint` this
   * session's own logout sends to the IdP's end-session endpoint. Supplied by the OIDC callback and by
   * nothing else (local login and first-run carry no IdP token, and omit it).
   *
   * IT IS A SECRET AND IT NEVER LEAVES THIS PATH. `verbs/create` seals it (AES-256-GCM, AAD = the session
   * row id) before it touches the database; it is never logged, never audited, never projected into a
   * `SessionView`, and never returned by any read. The only reader is the logout revoke, which consumes and
   * clears it. Absent/empty ⇒ the row stores nothing and logout falls back to the BARE end-session URL —
   * the pre-#141 behaviour, which is degraded UX and never a weaker logout.
   */
  readonly oidcIdToken?: string | null;
}

/**
 * `provisionIdentity` options — the CALLER-resolved admission decisions. The verb stays mode-AGNOSTIC (its
 * `isSubjectMismatch` scope note depends on that): the caller that KNOWS the mode computes these and the verb
 * just honors them. For `oidc` the callback resolves them from env (OIDC_SIGNUP / OIDC_REQUIRE_APPROVAL); for
 * `forward-header` the seam leaves the defaults (JIT on, no approval — the trusted proxy already gated WHO
 * reaches us). Both default to the pre-A1/A2 behavior so a caller that omits them is unchanged.
 */
export interface ProvisionIdentityOptions {
  /** A1 — may a brand-new (non-owner) identity be JIT-provisioned? Default true. `oidc` passes OIDC_SIGNUP;
   *  the box owner by policy is exempt regardless (never a "signup"). */
  readonly allowJitProvision?: boolean;
  /** A2 — does a first-time (non-owner) SSO user provision `enabled:false` (awaiting admin approval)?
   *  Default false. `oidc` passes OIDC_REQUIRE_APPROVAL; the owner is never gated. */
  readonly requireApproval?: boolean;
  /** D258 — did this login prove the owner claim, so an `OWNER_HANDLES` handle match may make it the owner? `oidc` passes
   *  whether the callback came from loopback or carried the boot claim code. Default true, the `forward-header`
   *  posture: the trusted proxy is the identity authority, so its handle is the owner's word. An `OWNER_GROUP`
   *  member needs no proof. */
  readonly ownerClaimProven?: boolean;
}
