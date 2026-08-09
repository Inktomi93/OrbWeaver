// A7 — map the OIDC callback's `?authError=<code>` param to a user-facing message. The server lands the
// browser back on /login with a sanitized snake_case code (never raw JSON in the address bar); this turns a
// KNOWN code into copy and falls back to a generic line for anything else (a raw IdP code we don't have a
// bespoke string for). The codes are the fixed literals the callback emits (entry/http/auth-routes.ts) plus
// any sanitized standard OAuth2 error the IdP forwarded — all match /^[a-z_]{1,64}$/, so this only ever
// switches on a safe token.

const GENERIC = "Sign-in didn't complete. Please try again.";

// A Map (not an object) so the snake_case wire codes stay codes, not identifier-shaped property names.
const MESSAGES = new Map<string, string>([
  ["invalid_state", "Your sign-in link expired or was already used. Please try again."],
  ["no_identity", "Your identity provider didn't return a usable account. Contact your administrator."],
  ["not_authorized", "Your account isn't authorized to use this application. Contact your administrator."],
  // MS-W1 — the collision hard-deny: the identity matches an existing account; an admin must LINK it (B5).
  ["account_exists", "An account for this identity already exists. Ask your administrator to link it to your single sign-on, then try again."],
  ["account_disabled", "Your account is disabled or awaiting administrator approval."],
  ["access_denied", "Sign-in was cancelled or denied at your identity provider."],
  ["token_exchange_failed", "Sign-in couldn't be completed with your identity provider. Please try again."],
]);

/** The message for an `authError` code, or null when there is no error to show. Unknown (but shape-safe)
 *  codes fall back to a generic line rather than echoing the raw token. */
export function authErrorMessage(code: string | null | undefined): string | null {
  if (code === null || code === undefined || code.length === 0) {
    return null;
  }
  return MESSAGES.get(code) ?? GENERIC;
}
