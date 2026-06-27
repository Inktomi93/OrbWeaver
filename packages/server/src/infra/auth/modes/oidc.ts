// `oidc` (AUTH_MODE=oidc, the app is an OIDC client) reads the SAME `__Host-orb_session` cookie `local`
// does — the steady-state read side is just "is the cookie a live session?", so the resolver delegates
// to `cookie-session`. The MINT side (discovery + code exchange via `openid-client`) is the route tier's
// (`entry/http/auth-routes.ts`, 4e). What lives here is the db-free PKCE/STATE VERIFY: the callback
// hands us the returned `state`, we atomically CONSUME the matching single-use transaction from the
// injected store (replay-proof — a second callback with the same state finds nothing) and hand back the
// PKCE `codeVerifier` + `nonce` the route needs for the exchange.

import type { OidcTransaction, ResolveDeps, ValidatedSession } from "../contract";
import { resolveCookieSession } from "./cookie-session";

/** Steady-state resolve: the live `__Host-orb_session` cookie (the mode-agnostic read path). */
export function resolveOidc(headers: Headers, deps: ResolveDeps): Promise<ValidatedSession | null> {
  return resolveCookieSession(headers, deps);
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
