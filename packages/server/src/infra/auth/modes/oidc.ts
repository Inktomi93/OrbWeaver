// `oidc` (AUTH_MODE=oidc) shares the `__Host-orb_session` cookie with `local`; steady-state resolve
// delegates to `cookie-session` (post-D40 the seam owns cookie read/validate). Mint + callback (discovery,
// PKCE/state/nonce verify, code exchange) is the route tier's job (entry/http/auth-routes.ts): the callback
// atomically CONSUMEs the single-use state-keyed transaction (replay-proof) then hands codeVerifier/nonce/
// state to openid-client's authorizationCodeGrant, which verifies state + nonce + PKCE on the exchange.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import { resolveCookieSession } from "./cookie-session";

export function resolveOidc(): Promise<ResolvedIdentity | null> {
  return resolveCookieSession();
}
