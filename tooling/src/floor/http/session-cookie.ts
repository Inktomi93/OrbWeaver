// How a dev tool tells that a login response minted a session. The names are the app's two session cookies,
// `SESSION_COOKIE_NAMES` in `@orb/contracts/identity`: one over https behind a trusted proxy, one over plain http.
import { SESSION_COOKIE_NAMES } from "@orb/contracts/identity";

const SESSION_NAME_ALTERNATION = Object.values(SESSION_COOKIE_NAMES)
  .map((name) => RegExp.escape(name))
  .join("|");

/**
 * Matches a `Set-Cookie` value, or a comma-joined `Set-Cookie` header, that carries a NON-EMPTY session
 * cookie. A mint under one name comes with a `Max-Age=0` clear of the other in the same response, so a
 * name-only check (`includes(name + "=")`) also matches the clear and reports a login that minted
 * nothing as a success.
 */
export const SESSION_COOKIE_MINTED = new RegExp(String.raw`(?:^|,\s*)(?:${SESSION_NAME_ALTERNATION})=[^;,\s]`, "u");
