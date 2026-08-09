// A9 — the SSO-only auto-redirect decision. In `oidc` mode the deployment is SSO-only (AUTH_MODE is a single
// exclusive mode), so /login should send the browser straight to the IdP instead of parking on a "Continue"
// button — UNLESS one of the study's suppression cases holds:
//   • `?authError=<code>` — a sign-in just FAILED; auto-redirecting would loop the user back into the same
//     failure. Show the error + a manual Continue.
//   • `?form` — the explicit escape hatch: a user (or an operator debugging) asked for the manual button, so
//     never bounce them.
//   • already authed — handled UPSTREAM by the route guard (`redirectIfAuthed`); an authed user never reaches
//     /login at all, so this helper only ever runs for the genuinely-unauthenticated case.
// Pure (mode + the raw location.search in, boolean out) so the suppression list is unit-tested without a
// navigation harness; the surface's effect calls it and does the single `location.assign`.

import type { AuthMode } from "@orb/contracts/identity";

/** The query-param names that SUPPRESS the SSO auto-redirect (a failed round-trip, or an explicit request for
 *  the manual button). */
const SUPPRESS_PARAMS = ["authError", "form"] as const;

/** Whether an unauthenticated /login visit in this mode should auto-redirect to the SSO login route. */
export function shouldAutoRedirectToSso(mode: AuthMode, locationSearch: string): boolean {
  if (mode !== "oidc") {
    return false;
  }
  const params = new URLSearchParams(locationSearch);
  return !SUPPRESS_PARAMS.some((name) => params.has(name));
}
