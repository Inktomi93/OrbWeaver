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
}
