// `oidc` (AUTH_MODE=oidc) shares the session cookie (`cookie-session.ts`) with `local`; steady-state resolve
// delegates to `cookie-session` (post-D40 the seam owns cookie read/validate). Mint + callback (discovery,
// PKCE/state/nonce verify, code exchange) is the route tier's job (entry/http/auth-routes.ts): the callback
// atomically CONSUMEs the single-use state-keyed transaction (replay-proof) then hands codeVerifier/nonce/
// state to openid-client's authorizationCodeGrant, which verifies state + nonce + PKCE on the exchange.

import type { RequestTransport, ResolvedIdentity } from "@orb/contracts/identity";
import type { SessionCookie } from "../contract.ts";
import { AUTH_COOKIE_ATTRS, resolveCookieSession } from "./cookie-session.ts";

/** How long a minted OIDC transaction stays consumable. The binding cookie's Max-Age is this same window. */
export const OIDC_TRANSACTION_TTL_MS = 600_000;

// THE BINDING COOKIE closes login CSRF. State, PKCE and nonce all live server-side, so none of them ties a
// callback to the browser that started the flow: an attacker who stops their own login at the callback URL
// can hand it to a victim, who then lands signed into the attacker's account. The authorize route writes the
// transaction's `state` into this cookie, and the callback proceeds only when the cookie matches the returned
// `state`. A cross-site page can make a victim open a URL; it cannot write a cookie into the victim's jar.

/** The https binding name. `__Host-` pins Secure + host-only + Path=/, so a sibling subdomain cannot plant it. */
export const OIDC_BINDING_COOKIE_NAME_SECURE = "__Host-orb_oidc_state";

/** The plain-http binding name. It has no prefix for the same reason as the insecure session name. A request
 *  reads only its own transport's name, so an https callback never trusts this plantable one. */
export const OIDC_BINDING_COOKIE_NAME_INSECURE = "orb_oidc_state_insecure";

const OIDC_BINDING_COOKIE_BY_TRANSPORT = {
  https: { name: OIDC_BINDING_COOKIE_NAME_SECURE, attrs: AUTH_COOKIE_ATTRS.https },
  http: { name: OIDC_BINDING_COOKIE_NAME_INSECURE, attrs: AUTH_COOKIE_ATTRS.http },
} as const satisfies Record<RequestTransport, SessionCookie>;

/** The binding cookie for a request's transport. `SameSite=Lax` is required: the IdP's redirect back is a
 *  cross-site top-level GET, which carries a Lax cookie and drops a Strict one. */
export function oidcBindingCookieFor(transport: RequestTransport): SessionCookie {
  return OIDC_BINDING_COOKIE_BY_TRANSPORT[transport];
}

/** Every binding cookie, https first. The callback clears all of them once the binding is spent. */
export const OIDC_BINDING_COOKIES: readonly SessionCookie[] = [OIDC_BINDING_COOKIE_BY_TRANSPORT.https, OIDC_BINDING_COOKIE_BY_TRANSPORT.http];

// THE PENDING-JOIN COOKIE (D254) carries the fresh secret that names a signed-out visitor's frozen identity
// between the callback and the confirm. It is never the `state`. `SameSite=Strict` is enough and is what we
// want: the confirm and the preview are same-origin fetches, and a cross-site request must never carry it.

/** How long a pending join stays confirmable. The cookie's Max-Age is this same window. */
export const OIDC_PENDING_JOIN_TTL_MS = 600_000;

const PENDING_JOIN_COOKIE_BY_TRANSPORT = {
  https: { name: "__Host-orb_join_pending", attrs: "Path=/; HttpOnly; Secure; SameSite=Strict" },
  http: { name: "orb_join_pending_insecure", attrs: "Path=/; HttpOnly; SameSite=Strict" },
} as const satisfies Record<RequestTransport, SessionCookie>;

/** The pending-join cookie for a request's transport. A request reads only its own transport's name. */
export function oidcPendingJoinCookieFor(transport: RequestTransport): SessionCookie {
  return PENDING_JOIN_COOKIE_BY_TRANSPORT[transport];
}

/** Every pending-join cookie, https first. A spent or refused join clears all of them. */
export const OIDC_PENDING_JOIN_COOKIES: readonly SessionCookie[] = [PENDING_JOIN_COOKIE_BY_TRANSPORT.https, PENDING_JOIN_COOKIE_BY_TRANSPORT.http];

export function resolveOidc(): Promise<ResolvedIdentity | null> {
  return resolveCookieSession();
}
