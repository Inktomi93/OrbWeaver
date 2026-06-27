// infra/auth — FRONT DOOR. The sealed, db-free auth VERIFICATION executor (tiers/infra.md + spine
// identity-auth-permission.md). `resolve(headers, deps)` turns a request's headers into the ONE
// immutable `Principal` (or null = unauthenticated → the caller 401s), dispatching on AUTH_MODE and
// applying the origin-gated owner fallback. Every db-dependent step (cookie validate, user upsert, OIDC
// PKCE store, JWT/JWKS crypto) arrives INJECTED via `ResolveDeps` — this module imports NO `@orb/db` and
// NO domain (the sealed-executor invariant; `infra-no-db` + `infra-no-domain`). It reaches DOWN only:
// `foundation/env` (via config), `foundation/observability` (securityEvent), `infra/network` (the CIDR
// matcher), `@orb/contracts/identity`, `@orb/kit/*`, `node:*`.
//
// `determineRole` is the ONE access-control decision the app owns: `owner` iff the handle ∈ OWNER_HANDLES
// or an SSO group ∈ OWNER_GROUP; else `user`. `admin` is NEVER env-derived — it is GRANTED (preserved by
// the injected upsert on UPDATE; spine §3, D17). The owner-fallback path (`via:"fallback"`) mints the
// owner directly.

import type { Principal, ResolvedIdentity, UserRole } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "./config";
import type { AuthConfig, ResolveDeps } from "./contract";
import { dispatchMode, ownerFallbackAllowed } from "./dispatch";

/** The owner-derivation inputs, pulled from the parsed `AuthConfig`. */
function ownerInputs(config: AuthConfig): { handles: readonly string[]; group?: string } {
  return config.ownerGroup !== undefined
    ? { handles: config.ownerHandles, group: config.ownerGroup }
    : { handles: config.ownerHandles };
}

/**
 * The ONE access-control decision the app owns. Returns `owner` iff the handle is an owner handle OR the
 * identity carries the owner SSO group; otherwise `user`. `admin` is GRANTED (never derived here) — it is
 * seeded by an owner's `setRole` and PRESERVED across logins by the injected upsert, so a granted admin
 * resolves to `role:"admin"` via the stored row even though `determineRole` only ever seeds `owner|user`.
 */
export function determineRole(
  handle: Handle,
  groups: readonly string[],
  owner: { handles: readonly string[]; group?: string },
): UserRole {
  const byHandle = owner.handles.includes(handle);
  const byGroup = owner.group !== undefined && groups.includes(owner.group);
  return byHandle || byGroup ? "owner" : "user";
}

/** The origin-gated owner fallback: the un-credentialed owner path. Mints the owner `Principal` with
 *  `via:"fallback"` (the SAFE "this IS the owner" discriminator — NEVER `externalId === null`). The
 *  userId is obtained through the injected `upsertUser` (handle-keyed → the owner row), keeping infra
 *  db-free; no enabled gate (the owner is the owner by definition, not a revocable user). */
async function resolveOwnerFallback(
  headers: Headers,
  config: AuthConfig,
  deps: ResolveDeps,
): Promise<Principal | null> {
  if (config.fallback !== "owner" || !ownerFallbackAllowed(headers, config)) {
    return null;
  }
  const identity: ResolvedIdentity = {
    externalId: null,
    handle: castId<Handle>(config.defaultHandle),
    groups: [],
  };
  const upserted = await deps.upsertUser(identity, "owner");
  return {
    userId: upserted.userId,
    role: "owner",
    handle: identity.handle,
    externalId: null,
    via: "fallback",
  };
}

/**
 * Resolve a request's headers → the immutable `Principal`, or `null` when the caller is unauthenticated
 * (the seam/transport turns null into a 401). Three resolution paths feed `userId`:
 *   - COOKIE (`local`/`oidc`) — `validateCookie` returns the fully-resolved session (userId already
 *     joined); a disabled/missing session falls through to the owner fallback.
 *   - SSO HEADER (`forward-header`) — the pre-row identity is upserted (`determineRole` seeds the role,
 *     a granted admin is preserved); a disabled user resolves to null (NO fallback).
 *   - OWNER FALLBACK — the origin-gated un-credentialed owner (`single-user` unconditionally).
 *
 * `config` is injectable via `deps.config` (tests vary mode/fallback without re-parsing the frozen env);
 * production omits it → `authConfigFromEnv()`.
 */
export async function resolve(headers: Headers, deps: ResolveDeps): Promise<Principal | null> {
  const config = deps.config ?? authConfigFromEnv();
  const outcome = await dispatchMode(headers, config, deps);

  if (outcome.kind === "session" && outcome.session.enabled) {
    const { session } = outcome;
    return {
      userId: session.userId,
      role: session.role,
      handle: session.handle,
      externalId: session.externalId,
      via: "cookie",
    };
  }

  if (outcome.kind === "identity") {
    const { identity } = outcome;
    const seedRole = determineRole(identity.handle, identity.groups, ownerInputs(config));
    const upserted = await deps.upsertUser(identity, seedRole);
    if (!upserted.enabled) {
      return null; // a disabled SSO user is unauthenticated — and is NOT granted the owner fallback.
    }
    return {
      userId: upserted.userId,
      role: upserted.role,
      handle: identity.handle,
      externalId: identity.externalId,
      via: "header",
    };
  }

  // `none`, or a cookie session that came back disabled → the origin-gated owner fallback.
  return resolveOwnerFallback(headers, config, deps);
}

// Cross-boundary identity types re-exported type-only for ergonomics (canonical home: @orb/contracts).
export type { Principal, ResolvedIdentity } from "@orb/contracts/identity";
// ── Public surface ───────────────────────────────────────────────────────────────────────────────
export { authConfigFromEnv } from "./config";
export type {
  AuthConfig,
  ForwardJwtClaims,
  ForwardJwtVerifier,
  ForwardJwtVerifyArgs,
  OidcTransaction,
  OidcTransactionStore,
  ResolveDeps,
  UpsertedUser,
  ValidatedSession,
} from "./contract";
export { CSRF_HEADER, hasCsrfHeader } from "./csrf";
export { dispatchMode, isLocalOrigin, ownerFallbackAllowed } from "./dispatch";
export { normalizeHost } from "./host";
export { SESSION_COOKIE_NAME } from "./modes/cookie-session";
export { verifyPkceState } from "./modes/oidc";
export {
  createPasswordHasher,
  DUMMY_PASSWORD_HASH,
  MIN_PASSWORD_LENGTH,
  type PasswordHasher,
} from "./password";
