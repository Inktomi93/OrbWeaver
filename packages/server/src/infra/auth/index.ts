// infra/auth — FRONT DOOR. The sealed, db-free auth VERIFICATION executor (docs/law/Tier-3-Infra.md + spine
// Spine-Identity-and-Auth.md §1/§3). This tier does VERIFICATION ONLY: `resolve(headers, deps)` turns a
// request's headers into an `IdentityResolution` — the pre-row `ResolvedIdentity` (NO `userId`, NO
// `role` — invariant #3) + the per-request signals (`via`, `hasCsrfHeader`) — dispatching on
// AUTH_MODE and applying the origin-gated owner fallback. It does NOT upsert, does NOT derive a role,
// does NOT mint a `Principal`. Those are LOWER tiers, invoked by the seam AFTER verification:
//   • `determineRole` + the users-row upsert → RESOLUTION tier, `domain/sessions`
//     (`substrate/role-policy.ts` + `verbs/provision-identity.ts`, Phase 4c).
//   • the ONE `Principal` mint (from `via:"fallback"` → owner, or the upserted row) → CONSTRUCTION tier,
//     `entry/auth/seam.ts` (Phase 4e, invariant #1).
//
// Every db-dependent VERIFICATION step (cookie validate, OIDC PKCE store, JWT/JWKS crypto) arrives
// INJECTED via `ResolveDeps` — this module imports NO `@orb/db` and NO domain (the sealed-executor
// invariant; `infra-no-db` + `infra-no-domain`). It reaches DOWN only: `foundation/env` (via config),
// `foundation/observability` (securityEvent), `infra/network` (the CIDR matcher), `@orb/contracts/*`,
// `@orb/kit/*`, `node:*`.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { IdentityResolution, ResolveDeps } from "./contract.ts";
import { hasCsrfHeader } from "./csrf.ts";
import { MODE_RESOLVERS, ownerFallbackAllowed } from "./dispatch.ts";
import { hasForwardingHeader } from "./forwarded.ts";
import { reportRelayedFallback } from "./relay-notice.ts";

/**
 * VERIFICATION: resolve a request's headers → an `IdentityResolution` (the pre-row identity + the seam's
 * signals). `identity === null` ⇒ the caller is unauthenticated (the seam/transport 401s). Three paths:
 *   - COOKIE (`local`/`oidc`) — resolves to `null` at infra (post-D40 the seam validates the cookie via
 *     `sessions.validate` BEFORE calling here), so cookie modes fall through to the owner fallback / unauth.
 *   - SSO HEADER (`forward-header`) — the verified header/JWT identity (NO upsert here — that's the seam).
 *   - OWNER FALLBACK — the peer-gated un-credentialed owner identity, stamped `via:"fallback"` (the seam
 *     mints the owner from this discriminant — invariant #7). Two conditions, in this order: the
 *     `AUTH_FALLBACK=owner` knob, THEN `ownerFallbackAllowed` (a LOOPBACK TCP peer or a peer inside
 *     `AUTH_FALLBACK_TRUSTED_PEERS`, on a request that carries no relay tell; never the client `Host`
 *     header). So `single-user` + `AUTH_FALLBACK=deny` resolves NOBODY — boot-fatal in `foundation/env`,
 *     since that fallback is single-user's only credential — and a LAN peer or any relayed request gets no
 *     fallback, including one a same-host tunnel delivers over loopback.
 *
 * `config` is the root's one `AuthConfig` (`authConfigFromEnv` over its parsed env record).
 */
export async function resolve(headers: Headers, deps: ResolveDeps): Promise<IdentityResolution> {
  const { config } = deps;
  const identity = await MODE_RESOLVERS[config.mode](headers, config, deps);
  const csrf = hasCsrfHeader(headers);

  if (identity !== null) {
    // A non-null identity from infra is always the forward-header path (post-D40 infra never resolves a
    // cookie — the seam does). `via:"header"`.
    return { identity, via: "header", hasCsrfHeader: csrf };
  }

  if (config.fallback === "owner") {
    if (ownerFallbackAllowed(deps.peerIp, headers, config.fallbackTrustedPeers)) {
      // `via:"fallback"` is the SAFE "this IS the owner" discriminator (NEVER `externalId === null`); the
      // seam mints the owner from it. NO role/userId is resolved here.
      return {
        identity: {
          externalId: null,
          handle: castId<Handle>(config.defaultHandle),
          groups: [],
          email: null,
        },
        via: "fallback",
        hasCsrfHeader: csrf,
      };
    }
    if (hasForwardingHeader(headers)) {
      if (deps.relayedFallbackNotice === undefined) {
        reportRelayedFallback(deps.peerIp, deps.log);
      } else {
        deps.relayedFallbackNotice(deps.peerIp);
      }
    }
  }

  // Unauthenticated: no identity. `via` is inert when `identity === null` (the seam 401s before reading it).
  return { identity: null, via: "header", hasCsrfHeader: csrf };
}

export { createBackchannelLogoutVerifier } from "./backchannel.ts";
// ── Public surface ───────────────────────────────────────────────────────────────────────────────
export { authConfigFromEnv, oidcRedirectAllowlist } from "./config.ts";
export type {
  AllowedHostsReader,
  AuthConfig,
  BackchannelLogoutVerifier,
  ForwardJwtVerifier,
  HostNotAllowedNotice,
  IdentityResolution,
  OidcExchange,
  OidcSettings,
  OidcTransaction,
  OidcTransactionStore,
  OwnerClaimCode,
  PublicHttpMintNotice,
  RelayedFallbackNotice,
  RelayHostWriter,
  ResolveDeps,
} from "./contract.ts";
export { hasCsrfHeader } from "./csrf.ts";
export { ownerFallbackAllowed } from "./dispatch.ts";
export { allowedHostsReader, createHostNotAllowedNotice, createRelayHostRegistry, refusedHost } from "./host-allowlist.ts";
export { createForwardJwtVerifier, createJwksReader } from "./jwks.ts";
export { readRequestCookie, SESSION_COOKIES, sessionCookieFor } from "./modes/cookie-session.ts";
export { selectSignedForwardJwt } from "./modes/forward-header.ts";
export {
  OIDC_BINDING_COOKIES,
  OIDC_PENDING_JOIN_COOKIES,
  oidcBindingCookieFor,
  oidcPendingJoinCookieFor,
} from "./modes/oidc.ts";
export { createOidcConfigCache } from "./oidc-discovery.ts";
export { createOidcExchange } from "./oidc-exchange.ts";
export { createOwnerClaimCode } from "./owner-claim.ts";
export { createPasswordHasher } from "./password.ts";
export { createRelayedFallbackNotice } from "./relay-notice.ts";
export { createPublicHttpMintNotice, reportPublicHttpMint, requestClientScope, requestTransport } from "./transport.ts";
