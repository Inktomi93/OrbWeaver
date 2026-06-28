// `oidc` (AUTH_MODE=oidc, the app is an OIDC client) shares the `__Host-orb_session` cookie with `local`.
// Post-D40 the steady-state cookie read/validate is the seam's job (`entry/auth/seam.ts` calls
// `sessions.validate` directly), so at the infra layer this mode resolves to `null` (→ owner-fallback /
// unauth in `resolve`); it delegates to the shared `cookie-session` null-returner. The MINT side
// (discovery + code exchange via `openid-client`) is the route tier's (`entry/http/auth-routes.ts`, 4e).
// What still lives HERE is the db-free PKCE/STATE VERIFY: the callback hands us the returned `state`, we
// atomically CONSUME the matching single-use transaction from the injected store (replay-proof — a second
// callback with the same state finds nothing) and hand back the PKCE `codeVerifier` + `nonce` for the
// exchange.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { OidcTransaction, ResolveDeps } from "../contract";
import { resolveCookieSession } from "./cookie-session";

/** Steady-state resolve: post-D40 the seam owns the cookie read (`sessions.validate`), so the infra cookie
 *  mode resolves to `null` (→ owner-fallback / unauth in `resolve`). Delegates to the shared cookie path. */
export function resolveOidc(): Promise<ResolvedIdentity | null> {
  return resolveCookieSession();
}

/**
 * Verify an OIDC callback's `state` against the injected (db-backed) transaction store, returning the
 * single-use transaction (with the PKCE `codeVerifier` + `nonce`) iff the state matches a stored one.
 * Returns null — FAIL-CLOSED — when no store is wired, the state is empty, the transaction is absent
 * (replay / forged / expired-and-swept), or (defensively) the stored row's state disagrees. `consume`
 * is atomic take-and-delete, so a replayed callback can never be re-driven.
 */
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
