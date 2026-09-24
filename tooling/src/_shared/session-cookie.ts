// How a dev tool tells that a login response minted a session. The names are the app's two session cookies
// (`packages/server/src/infra/auth/modes/cookie-session.ts`): `__Host-orb_session` over https behind a trusted
// proxy, `orb_session_insecure` over plain http.

/**
 * Matches a `Set-Cookie` value, or a comma-joined `Set-Cookie` header, that carries a NON-EMPTY session
 * cookie. A mint under one name comes with a `Max-Age=0` clear of the other in the same response, so a
 * name-only check (`includes("orb_session=")`) also matches the clear and reports a login that minted
 * nothing as a success.
 */
export const SESSION_COOKIE_MINTED = /(?:^|,\s*)(?:__Host-orb_session|orb_session_insecure)=[^;,\s]/u;
