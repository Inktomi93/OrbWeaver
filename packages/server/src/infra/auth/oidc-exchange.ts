// infra/auth/oidc-exchange — THE AUTHORIZATION-CODE → TOKEN EXCHANGE, as an injectable adapter (#867).
//
// It lives here, beside `oidc-discovery.ts`, for the same reason and in the same shape: this is external
// I/O (an HTTPS POST to the IdP's token endpoint plus the JWKS work to verify the returned ID token), infra
// is where the sealed executors live, and the CALLER injects the round-trip — which is what makes the
// contract provable without an IdP.
//
// WHY IT WAS EXTRACTED. Before #867 the grant was a module-level `openid-client` import inside
// `entry/http/auth-routes.ts`, which made the callback's ENTIRE happy path undrivable in-process: the
// package resolves only under `packages/server/node_modules`, so a `vi.mock("openid-client")` from `tests/`
// never binds (the real library runs and every callback test reports `token_exchange_failed` while LOOKING
// wired), and the path-form mock that WOULD bind is correctly RED under `test-mock-doctrine`. Injecting is
// the doctrine's own answer: fake at the edges, wire the real thing at the composition root.
//
// WHAT THIS FILE MUST NEVER GROW INTO. It is a NARROWING ADAPTER and nothing else:
//   • It does NOT catch. Every failure the grant raises — replayed/expired code, bad signature,
//     issuer/audience/nonce/state mismatch, a transient IdP fault — propagates to the route, which owns the
//     ONE fail-closed conversion (sanitize the code, mint no session). A catch here would move that decision
//     away from the tier that answers the browser, and a swallowed failure that resolved would mint a
//     session on an exchange that never succeeded.
//   • It does NOT relax a check. `pkceCodeVerifier`/`expectedNonce`/`expectedState` are read off the
//     single-use transaction the callback just consumed, so the three replay/injection defences of the code
//     flow ride every exchange by construction — there is no argument shape a caller could use to omit one.
//     Their mapping is the load-bearing assertion in this file's mirror test.
//   • It does NOT widen the return. Access and refresh tokens stay inside the grant's response; only the
//     verified claims and the raw ID token (#141, sealed downstream by `sessions.create`) cross the seam,
//     and neither is logged here or anywhere on the way.
//
// THERE IS NO DEFAULT GRANT AND NO ENV KNOB, deliberately: a switch that could substitute the exchange
// would be an authentication bypass wearing a test affordance. The single production binding is
// `entry/lifecycle.ts`, and `tsc` enforces the signature there.

import type { Configuration } from "openid-client";
import type { OidcCodeGrant, OidcExchange, OidcTransaction, OidcVerifiedTokens } from "./contract.ts";

/**
 * Build the OIDC code→token exchange over a supplied `openid-client` grant.
 *
 * The returned function is handed to the OIDC routes as `OidcRoutesDeps.exchange`. Its `callbackUrl` is the
 * URL the route RECONSTRUCTED from the transaction's stored (allowlist-validated) `redirectUri` plus the
 * incoming query — never the raw request URL — so the `redirect_uri` this exchange presents is the one the
 * IdP saw even behind a proxy.
 *
 * The ID token is returned ALONGSIDE the claims rather than re-derived later: the grant has already
 * verified it (signature, issuer, audience, nonce, PKCE), and this is the only moment the raw compact JWT
 * exists in the process.
 */
export function createOidcExchange(grant: OidcCodeGrant): OidcExchange {
  return async function exchange(config: Configuration, callbackUrl: URL, tx: OidcTransaction): Promise<OidcVerifiedTokens> {
    const tokens = await grant(config, callbackUrl, {
      pkceCodeVerifier: tx.codeVerifier,
      expectedNonce: tx.nonce,
      expectedState: tx.state,
    });
    return { claims: tokens.claims(), idToken: tokens.id_token ?? null };
  };
}
