// infra/auth — FRONT DOOR. The sealed, db-free auth VERIFICATION executor (tiers/infra.md + spine
// identity-auth-permission.md §1/§3). This tier does VERIFICATION ONLY: `resolve(headers, deps)` turns a
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
import { authConfigFromEnv } from "./config";
import type { IdentityResolution, ResolveDeps } from "./contract";
import { hasCsrfHeader } from "./csrf";
import { MODE_RESOLVERS, ownerFallbackAllowed } from "./dispatch";

/**
 * VERIFICATION: resolve a request's headers → an `IdentityResolution` (the pre-row identity + the seam's
 * signals). `identity === null` ⇒ the caller is unauthenticated (the seam/transport 401s). Three paths:
 *   - COOKIE (`local`/`oidc`) — resolves to `null` at infra (post-D40 the seam validates the cookie via
 *     `sessions.validate` BEFORE calling here), so cookie modes fall through to the owner fallback / unauth.
 *   - SSO HEADER (`forward-header`) — the verified header/JWT identity (NO upsert here — that's the seam).
 *   - OWNER FALLBACK — the origin-gated un-credentialed owner identity, stamped `via:"fallback"` (the seam
 *     mints the owner from this discriminant — invariant #7); `single-user` is unconditional.
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

  if (config.fallback === "owner" && ownerFallbackAllowed(headers, config)) {
    // The un-credentialed owner path. `via:"fallback"` is the SAFE "this IS the owner" discriminator
    // (NEVER `externalId === null`); the seam mints the owner from it. NO role/userId is resolved here.
    return {
      identity: { externalId: null, handle: castId<Handle>(config.defaultHandle), groups: [] },
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
// ── Public surface ───────────────────────────────────────────────────────────────────────────────
export { authConfigFromEnv } from "./config";
export type {
  AuthConfig,
  ForwardJwtClaims,
  ForwardJwtVerifier,
  ForwardJwtVerifyArgs,
  IdentityResolution,
  OidcTransaction,
  OidcTransactionStore,
  ResolveDeps,
} from "./contract";
export { CSRF_HEADER, hasCsrfHeader } from "./csrf";
export { isLocalOrigin, MODE_RESOLVERS, ownerFallbackAllowed } from "./dispatch";
export { normalizeHost } from "./host";
export { SESSION_COOKIE_NAME } from "./modes/cookie-session";
export { verifyPkceState } from "./modes/oidc";
export {
  createPasswordHasher,
  DUMMY_PASSWORD_HASH,
  MIN_PASSWORD_LENGTH,
  type PasswordHasher,
} from "./password";
