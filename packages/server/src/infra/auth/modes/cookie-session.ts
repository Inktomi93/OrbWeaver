// The cookie layer `local` and `oidc` modes share. Post-D40 (Route A) the cookie→user read is a DOMAIN
// step: the auth seam (`entry/auth/seam.ts`) calls `sessions.validate(token)` DIRECTLY — it returns the
// `userId` — BEFORE it ever falls through to infra's `resolve`. So infra no longer reads or validates the
// session cookie: the cookie modes resolve to `null` here, and `resolve` falls through to the owner-fallback
// / unauthenticated path (exactly what the seam relies on). The ONLY thing still homed here is the cookie
// NAME, shared by the seam's reader and the entry route writer.

import type { ResolvedIdentity } from "@orb/contracts/identity";

/** The browser-session cookie NAME (orbweaver-namespaced; was neo's `__Host-neo_session`). The `__Host-`
 *  prefix pins it to Secure + host-only + path=/ (no Domain). The READ side is the seam
 *  (`entry/auth/seam.ts`, D40); the WRITE side (set/clear) is the route tier (`entry/http/auth-routes.ts`);
 *  both MUST agree on this constant. */
export const SESSION_COOKIE_NAME = "__Host-orb_session";

/** Cookie-mode infra resolve: ALWAYS `null`. Post-D40 infra does NOT read or validate the session cookie —
 *  the seam validates it via `sessions.validate` before calling `resolve`, so the cookie modes contribute
 *  nothing at the infra layer and `resolve` falls through to the owner-fallback / unauth path. Both `local`
 *  and `oidc` delegate here — one home for the shared (now inert) cookie read path. */
export function resolveCookieSession(): Promise<ResolvedIdentity | null> {
  return Promise.resolve(null);
}
