// The cookie layer BOTH `local` and `oidc` modes share. They mint the SAME `__Host-orb_session` via the
// same sessions service — only HOW the session is CREATED differs (OIDC callback vs password-form
// login), not how it's READ. So the read path is one file, used by two mode resolvers. The db validate
// is INJECTED (`deps.validateCookie`) → infra stays db-free.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { ResolveDeps } from "../contract";

/** The browser-session cookie NAME (orbweaver-namespaced; was neo's `__Host-neo_session`). The `__Host-`
 *  prefix pins it to Secure + host-only + path=/ (no Domain). The WRITE side (set/clear) lives at the
 *  route tier (`entry/http/auth-routes.ts`); this reader + the writer MUST agree on this constant. */
export const SESSION_COOKIE_NAME = "__Host-orb_session";

/** Minimal cookie parse — we only ever read our own opaque session token. Avoids a cookie-lib dep at
 *  the resolver (the write side uses a Context-bearing helper). */
function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie");
  if (raw === null) {
    return null;
  }
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      // A malformed percent-encoding makes decodeURIComponent throw URIError → a 500. Our token is
      // opaque base64url (no percent-encoding), so a value that won't decode can't be ours: treat as
      // no-session (anonymous) rather than crash the request.
      const rawValue = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Read the `__Host-orb_session` cookie + validate it via the injected sessions service. Returns the
 *  pre-row `ResolvedIdentity` (NO `userId`/`role` — invariant #3; the seam resolves the row), or null
 *  when there's no cookie, no injected validator, or the validator says the session is gone (revoked /
 *  expired / disabled). Both `local` + `oidc` call this; the cookie itself is mode-agnostic. */
export function resolveCookieSession(
  headers: Headers,
  deps: ResolveDeps,
): Promise<ResolvedIdentity | null> {
  if (deps.validateCookie === undefined) {
    return Promise.resolve(null);
  }
  const token = readCookie(headers, SESSION_COOKIE_NAME);
  if (token === null) {
    return Promise.resolve(null);
  }
  // Forward the slide callback so a throttled server-side expiry slide also refreshes the cookie's
  // Max-Age (wired by the entry layer where a response Context is in hand; inert otherwise).
  return deps.validateCookie(token, deps.onSessionSlide);
}
