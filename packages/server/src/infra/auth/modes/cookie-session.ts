// Cookie layer `local` and `oidc` modes share. Post-D40, the auth seam calls `sessions.validate(token)`
// directly before ever falling through to infra's `resolve`, so infra no longer reads/validates the
// session cookie — the cookie modes resolve to `null` here. The cookie NAME stays homed here, shared by
// the seam's reader and the entry route writer.

import type { ResolvedIdentity } from "@orb/contracts/identity";

/** `__Host-` prefix pins Secure + host-only + path=/ (no Domain). Read side is the seam; write side is
 *  the route tier; both MUST agree on this constant. */
export const SESSION_COOKIE_NAME = "__Host-orb_session";

/** Cookie-mode infra resolve: ALWAYS `null` (post-D40, `resolve` falls through to owner-fallback/unauth). */
export function resolveCookieSession(): Promise<ResolvedIdentity | null> {
  return Promise.resolve(null);
}
