// `oidc` (AUTH_MODE=oidc) shares the `__Host-orb_session` cookie with `local`; steady-state resolve
// delegates to `cookie-session` (post-D40 the seam owns cookie read/validate). Mint (discovery + code
// exchange) is the route tier's job; what lives here is the PKCE/STATE VERIFY: atomically CONSUME the
// matching single-use transaction from the injected store (replay-proof) and return codeVerifier/nonce.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { OidcTransaction, ResolveDeps } from "../contract";
import { resolveCookieSession } from "./cookie-session";

export function resolveOidc(): Promise<ResolvedIdentity | null> {
  return resolveCookieSession();
}

/** Verify an OIDC callback's `state` against the injected transaction store; FAIL-CLOSED (returns null)
 *  when unwired, empty, absent, or mismatched. `consume` atomically take-and-deletes + enforces the
 *  10-min TTL, so a replayed callback can never be re-driven. */
export async function verifyPkceState(
  deps: ResolveDeps,
  returnedState: string,
): Promise<OidcTransaction | null> {
  if (deps.oidcStore === undefined || returnedState.length === 0) {
    return null;
  }
  const tx = await deps.oidcStore.consume(returnedState);
  if (tx === null || tx.state !== returnedState) {
    return null;
  }
  return tx;
}
