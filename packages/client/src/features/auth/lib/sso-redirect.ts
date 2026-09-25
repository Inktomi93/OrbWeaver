// A9 (default FLIPPED, owner ruling 2026-08-09) — the SSO auto-redirect decision. The DEFAULT is now to
// render the branded /login page and let the user click "Continue with <IdP>": the woven-web login surface
// is the point, and a self-hosted app instant-bouncing to an external IdP reads as a phishing jump. The
// browser is sent straight to the IdP ONLY on explicit opt-in:
//   • `?sso` — the instant-bounce escape hatch (a bookmark / an operator who wants no click). This is the
//     one param that turns auto-redirect ON; everything else shows the page.
//   • `?authError=<code>` STILL wins even beside `?sso` — a sign-in just FAILED, so bouncing would loop the
//     user back into the same failure; show the error + the manual Continue.
//   • already authed — handled UPSTREAM by the route guard (`redirectIfAuthed`); an authed user never reaches
//     /login at all, so this helper only ever runs for the genuinely-unauthenticated case.
// Pure (mode + the raw location.search in, boolean out) so the opt-in rule is unit-tested without a
// navigation harness; the surface's effect calls it and does the single `location.assign`.

import type { AuthMode } from "@orb/contracts/identity";

/** The opt-in query param that TURNS ON the SSO auto-redirect (the instant-bounce escape hatch). */
const FORCE_PARAM = "sso";
/** A failed round-trip param — suppresses the redirect even when `?sso` is present, so a failure can't loop. */
const FAILURE_PARAM = "authError";
/** D254 — the callback's landing for a pending join. It carries no secret: the pending cookie names the join. */
const PENDING_JOIN_PARAM = "pendingJoin";
/** The OIDC login route (a whole-window navigation; the server 302s to the IdP). */
const OIDC_LOGIN_ROUTE = "/api/auth/oidc/login";

/** Whether an unauthenticated /login visit in this mode should auto-redirect to the SSO login route.
 *  Default false (show the page); true only on explicit `?sso`, and never when `?authError` is present. */
export function shouldAutoRedirectToSso(mode: AuthMode, locationSearch: string): boolean {
  if (mode !== "oidc") {
    return false;
  }
  const params = new URLSearchParams(locationSearch);
  return params.has(FORCE_PARAM) && !params.has(FAILURE_PARAM) && !params.has(PENDING_JOIN_PARAM);
}

/** D254 — is this /login visit the callback's pending-join landing? */
export function isPendingJoinLanding(locationSearch: string): boolean {
  return new URLSearchParams(locationSearch).has(PENDING_JOIN_PARAM);
}

/** D254 — the OIDC login URL. A stashed signup invite rides it as `?invite=` to the server, which keeps only its
 *  peppered hash on the transaction. The route 302s at once, so the token never becomes a history entry. */
export function oidcLoginUrl(joinToken: string | null): string {
  return joinToken === null ? OIDC_LOGIN_ROUTE : `${OIDC_LOGIN_ROUTE}?${new URLSearchParams({ invite: joinToken }).toString()}`;
}
