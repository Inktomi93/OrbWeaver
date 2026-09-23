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
import { authConfigFromEnv } from "./config.ts";
import type { AuthConfig, IdentityResolution, ResolveDeps } from "./contract.ts";
import { hasCsrfHeader } from "./csrf.ts";
import { MODE_RESOLVERS, ownerFallbackAllowed } from "./dispatch.ts";
import { hasForwardingHeader } from "./forwarded.ts";

/** The widened peer set a request is actually judged against. The LOOPBACK arm lives in
 *  `ownerFallbackAllowed` and is untouched by this; what this decides is whether the operator's opt-in
 *  `AUTH_FALLBACK_TRUSTED_PEERS` ranges are in play for THIS request. They are not when the request announces
 *  a proxy hop: the widened arm's premise is "this peer is the deployer", and a relayed request means the
 *  peer is a forwarder speaking for a third party (`forwarded.ts` holds the reasoning and the fail-open
 *  limit). Composed HERE rather than inside the predicate so `dispatch.ts` stays pure over (peer, ranges)
 *  and the two loopback-only call sites cannot accidentally inherit a header rule they have no headers for. */
function admissiblePeerRanges(headers: Headers, config: AuthConfig): readonly string[] {
  return hasForwardingHeader(headers) ? [] : config.fallbackTrustedPeers;
}

/**
 * VERIFICATION: resolve a request's headers → an `IdentityResolution` (the pre-row identity + the seam's
 * signals). `identity === null` ⇒ the caller is unauthenticated (the seam/transport 401s). Three paths:
 *   - COOKIE (`local`/`oidc`) — resolves to `null` at infra (post-D40 the seam validates the cookie via
 *     `sessions.validate` BEFORE calling here), so cookie modes fall through to the owner fallback / unauth.
 *   - SSO HEADER (`forward-header`) — the verified header/JWT identity (NO upsert here — that's the seam).
 *   - OWNER FALLBACK — the peer-gated un-credentialed owner identity, stamped `via:"fallback"` (the seam
 *     mints the owner from this discriminant — invariant #7). Two conditions, in this order: the
 *     `AUTH_FALLBACK=owner` knob, THEN the peer gate (`ownerFallbackAllowed(deps.peerIp)` — a LOOPBACK TCP
 *     peer, the unspoofable socket, NOT the client `Host` header; #298 f2). So `single-user` +
 *     `AUTH_FALLBACK=deny` resolves NOBODY — boot-fatal in `foundation/env`, since that fallback is
 *     single-user's only credential — and a proxied/LAN peer (non-loopback) gets no fallback, making SSO
 *     mandatory everywhere Caddy fronts. A deployer may WIDEN that peer set with
 *     `AUTH_FALLBACK_TRUSTED_PEERS` (unset = no change); the widened arm alone carries a third condition,
 *     the no-proxy-hop belt in `admissiblePeerRanges`.
 *
 * `config` is injectable via `deps.config` (tests vary mode/fallback without re-parsing the frozen env);
 * production omits it → `authConfigFromEnv()`.
 */
export async function resolve(headers: Headers, deps: ResolveDeps): Promise<IdentityResolution> {
  const config = deps.config ?? authConfigFromEnv();
  const identity = await MODE_RESOLVERS[config.mode](headers, config, deps);
  const csrf = hasCsrfHeader(headers);

  if (identity !== null) {
    // A non-null identity from infra is always the forward-header path (post-D40 infra never resolves a
    // cookie — the seam does). `via:"header"`.
    return { identity, via: "header", hasCsrfHeader: csrf };
  }

  if (config.fallback === "owner" && ownerFallbackAllowed(deps.peerIp, admissiblePeerRanges(headers, config))) {
    // The un-credentialed owner path, gated on a LOOPBACK TCP peer (#298 f2) — or, when the deployer opted
    // in, a peer inside `AUTH_FALLBACK_TRUSTED_PEERS` on a request that announces no proxy hop (see
    // `admissiblePeerRanges`). `via:"fallback"` is the SAFE "this IS the owner" discriminator (NEVER
    // `externalId === null`); the seam mints the owner from it. NO role/userId is resolved here.
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

  // Unauthenticated: no identity. `via` is inert when `identity === null` (the seam 401s before reading it).
  return { identity: null, via: "header", hasCsrfHeader: csrf };
}

// Cross-boundary identity type re-exported type-only for ergonomics (canonical home: @orb/contracts).
// NOTE: `Principal` is NOT re-exported — infra/auth never constructs one (that is `entry/auth/seam.ts`).
export type { ResolvedIdentity } from "@orb/contracts/identity";
export { CSRF_HEADER } from "@orb/contracts/identity";
export {
  type BackchannelLogoutVerifier,
  type BackchannelVerifyArgs,
  createBackchannelLogoutVerifier,
  type LogoutTokenSubject,
} from "./backchannel.ts";
// ── Public surface ───────────────────────────────────────────────────────────────────────────────
export { authConfigFromEnv } from "./config.ts";
export type {
  AuthConfig,
  ForwardJwtClaims,
  ForwardJwtVerifier,
  ForwardJwtVerifyArgs,
  IdentityResolution,
  OidcCodeGrant,
  OidcDiscover,
  OidcExchange,
  OidcTransaction,
  OidcTransactionStore,
  OidcVerifiedTokens,
  ResolveDeps,
} from "./contract.ts";
export { hasCsrfHeader } from "./csrf.ts";
export { MODE_RESOLVERS, ownerFallbackAllowed } from "./dispatch.ts";
export { hasForwardingHeader } from "./forwarded.ts";
export { normalizeHost } from "./host.ts";
export { createForwardJwtVerifier, jwksCacheSize, jwksFor, resetJwksCache } from "./jwks.ts";
export {
  SESSION_COOKIE_ATTRS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME_INSECURE,
  SESSION_COOKIE_NAME_SECURE,
  SESSION_COOKIES,
} from "./modes/cookie-session.ts";
export { selectSignedForwardJwt } from "./modes/forward-header.ts";
export { createOidcConfigCache } from "./oidc-discovery.ts";
export { createOidcExchange } from "./oidc-exchange.ts";
export {
  createPasswordHasher,
  DUMMY_PASSWORD_HASH,
  MIN_PASSWORD_LENGTH,
  type PasswordHasher,
} from "./password.ts";
