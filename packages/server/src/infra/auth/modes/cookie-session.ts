// Cookie layer `local` and `oidc` modes share. Post-D40, the auth seam calls `sessions.validate(token)`
// directly before ever falling through to infra's `resolve`, so infra no longer reads/validates the
// session cookie — the cookie modes resolve to `null` here. The cookie NAME stays homed here, shared by
// the seam's reader and the entry route writer.
//
// TWO NAMES, EXACTLY ONE ACTIVE (#2413). The default cookie is `__Host-orb_session` + `Secure`, which a
// browser refuses to keep on a plain-http origin other than `localhost` — so a phone at
// `http://192.168.1.20:8788` could not hold a login at all. `SESSION_COOKIE_INSECURE=true`
// (`foundation/env/session-cookie.ts` holds the model, the cost, and the never-auto-detect rule) switches the
// mint to a DISTINCT name with no `Secure`. Distinct on purpose: one jar can hold both, and two cookies
// sharing a name would let a stale one shadow the live one in whichever order the browser happened to send
// them — the shadowing class `session-cookie-parity.suite.test.ts` pins for the single-name case.
//
// THE ATTRIBUTES ARE A FUNCTION OF THE NAME, NOT OF THE KNOB, and that is load-bearing: the `__Host-` prefix
// REQUIRES `Secure` + `Path=/` + no `Domain` (RFC 6265bis §4.1.3.2), so a browser drops any `Set-Cookie`
// under that name that omits them — including the CLEARING one a logout writes for the other name. Pairing
// each name with its own attribute string here is what keeps that true at every write site.
//
// ONLY THE ACTIVE NAME IS EVER READ. The inactive name appears in exactly one place — the clear-both write
// at logout/mint (`entry/http/auth-routes.ts`) — so flipping the knob cannot leave a token that still
// authenticates, and an attacker who can set a bare-named cookie on a `__Host-`-posture box cannot get it
// read (the whole point of the prefix).

import type { ResolvedIdentity } from "@orb/contracts/identity";
import { resolveSessionCookiePosture, sessionCookiePostureInput } from "#foundation/env";

/** The DEFAULT name. `__Host-` pins Secure + host-only + path=/ (no Domain), which is why it cannot be
 *  kept by a browser on a plain-http non-localhost origin. */
export const SESSION_COOKIE_NAME_SECURE = "__Host-orb_session";

/**
 * The `SESSION_COOKIE_INSECURE=true` name — no cookie-prefix, so no attribute is forced on it and it can
 * therefore omit `Secure`. (`__Host-` and `__Secure-` both REQUIRE `Secure`, RFC 6265bis §4.1.3, so a
 * prefixed spelling here would be a `Set-Cookie` the browser discards — the knob would silently do nothing.)
 *
 * NEITHER FULL NAME IS A SUBSTRING OF THE OTHER, and the bare `orb_session` it started as was rejected for
 * exactly that: `__Host-orb_session` ENDS WITH it, so any ad-hoc `includes`/regex written against the
 * insecure name would also match the secure cookie. The cookie readers all exact-match, so this is a
 * legibility belt rather than a parse one — but the shared stem `orb_session` still matches both under a
 * deliberate grep, which is the property worth keeping. The word `insecure` is in the name on purpose: an
 * operator looking at their own cookie jar should be able to see which posture their box is in.
 */
export const SESSION_COOKIE_NAME_INSECURE = "orb_session_insecure";

const SECURE_ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax";
/** The same policy minus `Secure` — `HttpOnly` (no script read), `SameSite=Lax` (no cross-site ride) and
 *  `Path=/` all still apply. Dropping `Secure` costs confidentiality on the wire, nothing else. */
const INSECURE_ATTRS = "Path=/; HttpOnly; SameSite=Lax";

/** EVERY name this app has ever minted a session under, each with the attributes that name requires. The
 *  clear-both write at logout iterates this, so a knob flip can never strand a live token in a browser jar
 *  under the name that is no longer read. A third posture is a row here and nothing else. */
export const SESSION_COOKIES = [
  { name: SESSION_COOKIE_NAME_SECURE, attrs: SECURE_ATTRS },
  { name: SESSION_COOKIE_NAME_INSECURE, attrs: INSECURE_ATTRS },
] as const;

/** Resolved ONCE at module load from the frozen env — a per-request decision is precisely what this must not
 *  be (a forged `X-Forwarded-Proto` would otherwise ask for a cleartext-transportable cookie). */
const posture = resolveSessionCookiePosture(sessionCookiePostureInput());

/** THE cookie name for this process. Read side is the seam (`entry/auth/seam.ts`), write side is the route
 *  tier (`entry/http/auth-routes.ts`); both MUST agree on this constant. */
export const SESSION_COOKIE_NAME = posture.secure ? SESSION_COOKIE_NAME_SECURE : SESSION_COOKIE_NAME_INSECURE;

/** The attribute string that goes with {@link SESSION_COOKIE_NAME}. */
export const SESSION_COOKIE_ATTRS = posture.secure ? SECURE_ATTRS : INSECURE_ATTRS;

/** Cookie-mode infra resolve: ALWAYS `null` (post-D40, `resolve` falls through to owner-fallback/unauth). */
export function resolveCookieSession(): Promise<ResolvedIdentity | null> {
  return Promise.resolve(null);
}
