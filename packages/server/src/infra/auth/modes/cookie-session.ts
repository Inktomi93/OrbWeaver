// Cookie layer `local` and `oidc` modes share. Post-D40, the auth seam calls `sessions.validate(token)`
// directly before ever falling through to infra's `resolve`, so infra no longer reads/validates the
// session cookie — the cookie modes resolve to `null` here. The cookie NAMES stay homed here, shared by
// the seam's reader and the entry route writer.
//
// ONE NAME PER TRANSPORT (`transport.ts` decides the transport per request). Over https the cookie is
// `__Host-orb_session` + `Secure`. A browser refuses a `Secure` cookie from a plain-http origin other than
// `localhost`, and the `__Host-` prefix REQUIRES `Secure` (RFC 6265bis §4.1.3.2), so plain http gets a
// DISTINCT, prefix-less name without `Secure`. Distinct on purpose: one jar can hold both, and two cookies
// sharing a name would let a stale one shadow the live one in whichever order the browser sent them.
//
// THE ATTRIBUTES ARE A FUNCTION OF THE NAME. A browser drops any `Set-Cookie` under the `__Host-` name that
// omits `Secure` + `Path=/` + no `Domain`, including the CLEARING one a logout writes. Pairing each name with
// its own attribute string here keeps that true at every write site.
//
// A REQUEST READS ONLY ITS OWN TRANSPORT'S NAME. The insecure name carries no prefix, so a plain-http sibling
// origin can plant it; an https request that read it would hand every https session that fixation hole.

import type { RequestTransport, ResolvedIdentity } from "@orb/contracts/identity";
import type { SessionCookie } from "../contract.ts";

/** The https name. `__Host-` pins Secure + host-only + path=/ (no Domain). */
export const SESSION_COOKIE_NAME_SECURE = "__Host-orb_session";

/**
 * The plain-http name. No cookie-prefix: `__Host-` and `__Secure-` both REQUIRE `Secure` (RFC 6265bis
 * §4.1.3), so a prefixed spelling without it is a `Set-Cookie` the browser discards. NEITHER FULL NAME IS A
 * SUBSTRING OF THE OTHER, so an ad-hoc `includes` or regex against one cannot also match the other. The word
 * `insecure` lets an operator see in their own cookie jar that the session rides plain http.
 */
export const SESSION_COOKIE_NAME_INSECURE = "orb_session_insecure";

/** `HttpOnly` (no script read), `SameSite=Lax` (no cross-site ride) and `Path=/` apply on both transports;
 *  dropping `Secure` costs confidentiality on the wire and nothing else. */
const SESSION_COOKIE_BY_TRANSPORT = {
  https: { name: SESSION_COOKIE_NAME_SECURE, attrs: "Path=/; HttpOnly; Secure; SameSite=Lax" },
  http: { name: SESSION_COOKIE_NAME_INSECURE, attrs: "Path=/; HttpOnly; SameSite=Lax" },
} as const satisfies Record<RequestTransport, SessionCookie>;

/** The session cookie for a request's transport. The reader (`entry/auth/seam.ts`) and the writer
 *  (`entry/http/auth-routes.ts`) both call this with the SAME request's transport. */
export function sessionCookieFor(transport: RequestTransport): SessionCookie {
  return SESSION_COOKIE_BY_TRANSPORT[transport];
}

/** Every session cookie, https first. The logout clear and the mint's clear of the other name iterate it, so a
 *  browser that signed in over both transports holds no live token after sign-out. */
export const SESSION_COOKIES: readonly SessionCookie[] = [SESSION_COOKIE_BY_TRANSPORT.https, SESSION_COOKIE_BY_TRANSPORT.http];

/** Cookie-mode infra resolve: ALWAYS `null` (post-D40, `resolve` falls through to owner-fallback/unauth). */
export function resolveCookieSession(): Promise<ResolvedIdentity | null> {
  return Promise.resolve(null);
}
